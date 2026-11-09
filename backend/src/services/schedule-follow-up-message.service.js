import pool from "../config/database.js";

function serviceError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function sameRequest(existing, input, followUpId, recipient) {
  return (
    Number(existing.follow_up_id) === followUpId &&
    existing.channel === input.channel &&
    existing.recipient === recipient &&
    (existing.subject ?? null) === (input.subject ?? null) &&
    existing.body === input.body &&
    new Date(existing.scheduled_for).getTime() ===
      new Date(input.scheduledFor).getTime()
  );
}

export async function scheduleFollowUpMessage(
  businessId,
  followUpId,
  input,
) {
  const scheduledDate = new Date(input.scheduledFor);

  if (Number.isNaN(scheduledDate.getTime()) || scheduledDate <= new Date()) {
    throw serviceError("The scheduled time must be in the future.", 400);
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const followUpResult = await client.query(
      `
        SELECT
          f.id AS follow_up_id,
          f.status AS follow_up_status,
          e.id AS enquiry_id,
          c.id AS customer_id,
          c.email,
          c.phone
        FROM follow_ups f
        JOIN enquiries e
          ON e.business_id = f.business_id
         AND e.id = f.enquiry_id
        JOIN customers c
          ON c.business_id = e.business_id
         AND c.id = e.customer_id
        WHERE f.business_id = $1
          AND f.id = $2
        FOR SHARE OF f, e, c
      `,
      [businessId, followUpId],
    );

    if (followUpResult.rowCount === 0) {
      throw serviceError("Follow-up not found.", 404);
    }

    const followUp = followUpResult.rows[0];

    if (followUp.follow_up_status !== "pending") {
      throw serviceError(
        "Messages can only be scheduled for pending follow-ups.",
        409,
      );
    }

    const preferenceResult = await client.query(
      `
        SELECT consent_status
        FROM customer_communication_preferences
        WHERE business_id = $1
          AND customer_id = $2
          AND channel = $3
      `,
      [businessId, followUp.customer_id, input.channel],
    );

    if (
      preferenceResult.rowCount === 0 ||
      preferenceResult.rows[0].consent_status !== "granted"
    ) {
      throw serviceError(
        `The customer has not granted ${input.channel} communication consent.`,
        403,
      );
    }

    const recipient =
      input.channel === "email" ? followUp.email : followUp.phone;

    if (!recipient) {
      throw serviceError(
        `The customer does not have a ${input.channel} contact detail.`,
        400,
      );
    }

    if (
      input.channel === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)
    ) {
      throw serviceError("The customer's email address is invalid.", 400);
    }

    if (
      ["sms", "whatsapp"].includes(input.channel) &&
      !/^\+[1-9]\d{7,14}$/.test(recipient)
    ) {
      throw serviceError(
        "The customer's phone number must use international format, for example +2348012345678.",
        400,
      );
    }

    if (input.idempotencyKey) {
      const existingResult = await client.query(
        `
          SELECT *
          FROM follow_up_messages
          WHERE business_id = $1
            AND idempotency_key = $2
        `,
        [businessId, input.idempotencyKey],
      );

      if (existingResult.rowCount > 0) {
        const existing = existingResult.rows[0];

        if (!sameRequest(existing, input, followUpId, recipient)) {
          throw serviceError(
            "This idempotency key has already been used for a different message.",
            409,
          );
        }

        await client.query("COMMIT");
        return { message: existing, alreadyScheduled: true };
      }
    }

    const insertResult = await client.query(
      `
        INSERT INTO follow_up_messages (
          business_id,
          follow_up_id,
          enquiry_id,
          customer_id,
          channel,
          recipient,
          subject,
          body,
          status,
          scheduled_for,
          next_attempt_at,
          idempotency_key
        )
        VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8,
          'pending', $9, $9, $10
        )
        ON CONFLICT (business_id, idempotency_key)
        DO NOTHING
        RETURNING *
      `,
      [
        businessId,
        followUpId,
        followUp.enquiry_id,
        followUp.customer_id,
        input.channel,
        recipient,
        input.subject ?? null,
        input.body,
        scheduledDate,
        input.idempotencyKey ?? null,
      ],
    );

    if (insertResult.rowCount === 0 && input.idempotencyKey) {
      const existingResult = await client.query(
        `
          SELECT *
          FROM follow_up_messages
          WHERE business_id = $1
            AND idempotency_key = $2
        `,
        [businessId, input.idempotencyKey],
      );

      const existing = existingResult.rows[0];

      if (!existing || !sameRequest(existing, input, followUpId, recipient)) {
        throw serviceError(
          "This idempotency key has already been used for a different message.",
          409,
        );
      }

      await client.query("COMMIT");
      return { message: existing, alreadyScheduled: true };
    }

    await client.query("COMMIT");

    return {
      message: insertResult.rows[0],
      alreadyScheduled: false,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
