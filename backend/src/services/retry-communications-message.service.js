import pool from "../config/database.js";

const MAX_TOTAL_ATTEMPTS = 10;

export async function retryCommunicationsMessage(businessId, messageId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          m.id,
          m.status,
          m.attempt_count,
          m.max_attempts,
          EXISTS (
            SELECT 1
            FROM follow_ups f
            WHERE f.business_id = m.business_id
              AND f.id = m.follow_up_id
              AND f.status = 'pending'
          ) AS follow_up_pending,
          EXISTS (
            SELECT 1
            FROM customer_communication_preferences p
            WHERE p.business_id = m.business_id
              AND p.customer_id = m.customer_id
              AND p.channel = m.channel
              AND p.consent_status = 'granted'
          ) AS consent_granted
        FROM follow_up_messages m
        WHERE m.business_id = $1
          AND m.id = $2
        FOR UPDATE OF m
      `,
      [businessId, messageId],
    );

    if (result.rowCount === 0) {
      await client.query("COMMIT");
      return { message: null, conflict: false };
    }

    const message = result.rows[0];

    const isBillingBlocked = message.status === "billing_blocked";

    if (message.status !== "failed" && !isBillingBlocked) {
      await client.query("COMMIT");
      return {
        message,
        conflict: true,
        reason: "Only definitively failed or billing-blocked messages can be resumed.",
      };
    }

    if (!message.follow_up_pending || !message.consent_granted) {
      await client.query("COMMIT");
      return {
        message,
        conflict: true,
        reason: "The follow-up or customer consent is no longer eligible for delivery.",
      };
    }

    // Billing blocks happen before provider submission and do not consume
    // the provider retry allowance. Failed provider deliveries retain the
    // existing automatic-retry and hard-attempt limits.
    if (!isBillingBlocked) {
      if (Number(message.attempt_count) >= MAX_TOTAL_ATTEMPTS) {
        await client.query("COMMIT");
        return {
          message,
          conflict: true,
          reason: "The maximum delivery attempt limit has been reached.",
        };
      }

      if (Number(message.attempt_count) < Number(message.max_attempts)) {
        await client.query("COMMIT");
        return {
          message,
          conflict: true,
          reason: "This message still has automatic retry attempts remaining.",
        };
      }
    }

    const updated = await client.query(
      `
        UPDATE follow_up_messages
        SET status = 'pending',
            max_attempts = CASE
              WHEN $3 = 'failed' THEN attempt_count + 1
              ELSE max_attempts
            END,
            next_attempt_at = NOW(),
            last_error = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE business_id = $1
          AND id = $2
          AND status = $3
        RETURNING
          id,
          follow_up_id,
          customer_id,
          channel,
          status,
          attempt_count,
          max_attempts,
          scheduled_for,
          next_attempt_at,
          updated_at
      `,
      [businessId, messageId, message.status],
    );

    if (updated.rowCount !== 1) {
      throw new Error("Beevo could not safely queue the retry.");
    }

    await client.query("COMMIT");

    return {
      message: updated.rows[0],
      conflict: false,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
