import { randomUUID } from "node:crypto";
import pool from "../config/database.js";
import { sendFollowUpEmail } from "../utils/send-follow-up-email.js";

async function claimDueMessages(db, workerId, batchSize) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    // An abandoned delivery has an unknown provider outcome.
    // Never automatically retry it: the provider may already have accepted it.
    await client.query(
      `
        UPDATE message_delivery_attempts a
        SET status = 'unknown',
            error_message = 'The previous delivery worker stopped before completion; provider outcome is unknown.',
            attempted_at = NOW()
        FROM follow_up_messages m
        WHERE m.business_id = a.business_id
          AND m.id = a.message_id
          AND m.status = 'processing'
          AND m.locked_at < NOW() - INTERVAL '10 minutes'
          AND a.attempt_number = m.attempt_count
          AND a.status = 'processing'
      `,
    );

    await client.query(
      `
        UPDATE follow_up_messages
        SET status = 'unknown',
            last_error = 'Delivery outcome is unknown because the previous worker stopped before completion. Manual review is required; automatic retry was prevented to avoid duplicate delivery.',
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE status = 'processing'
          AND locked_at < NOW() - INTERVAL '10 minutes'
      `,
    );

    // Cancel messages when consent has been withdrawn.
    await client.query(
      `
        UPDATE follow_up_messages m
        SET status = 'cancelled',
            last_error = 'Email delivery skipped because customer consent is not granted.',
            updated_at = NOW()
        WHERE m.status = 'pending'
          AND m.channel = 'email'
          AND NOT EXISTS (
            SELECT 1
            FROM customer_communication_preferences p
            WHERE p.business_id = m.business_id
              AND p.customer_id = m.customer_id
              AND p.channel = 'email'
              AND p.consent_status = 'granted'
          )
      `,
    );

    // Cancel messages whose follow-up is no longer pending.
    await client.query(
      `
        UPDATE follow_up_messages m
        SET status = 'cancelled',
            last_error = 'Message cancelled because its follow-up is no longer pending.',
            updated_at = NOW()
        WHERE m.status = 'pending'
          AND EXISTS (
            SELECT 1
            FROM follow_ups f
            WHERE f.business_id = m.business_id
              AND f.id = m.follow_up_id
              AND f.status <> 'pending'
          )
      `,
    );

    const dueResult = await client.query(
      `
        SELECT m.*
        FROM follow_up_messages m
        INNER JOIN customer_communication_preferences p
          ON p.business_id = m.business_id
         AND p.customer_id = m.customer_id
         AND p.channel = 'email'
         AND p.consent_status = 'granted'
        INNER JOIN follow_ups f
          ON f.business_id = m.business_id
         AND f.id = m.follow_up_id
         AND f.status = 'pending'
        WHERE m.status = 'pending'
          AND m.channel = 'email'
          AND m.scheduled_for <= NOW()
          AND m.next_attempt_at <= NOW()
        ORDER BY m.next_attempt_at ASC, m.id ASC
        LIMIT $1
        FOR UPDATE OF m SKIP LOCKED
      `,
      [batchSize],
    );

    const claimed = [];

    for (const message of dueResult.rows) {
      const updated = await client.query(
        `
          UPDATE follow_up_messages
          SET status = 'processing',
              attempt_count = attempt_count + 1,
              locked_at = NOW(),
              locked_by = $3,
              updated_at = NOW()
          WHERE business_id = $1
            AND id = $2
            AND status = 'pending'
          RETURNING *
        `,
        [message.business_id, message.id, workerId],
      );

      const current = updated.rows[0];

      if (!current) continue;

      await client.query(
        `
          INSERT INTO message_delivery_attempts (
            business_id,
            message_id,
            attempt_number,
            provider,
            status
          )
          VALUES ($1, $2, $3, 'resend', 'processing')
        `,
        [
          current.business_id,
          current.id,
          current.attempt_count,
        ],
      );

      claimed.push(current);
    }

    await client.query("COMMIT");
    return claimed;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

// Recheck both consent and follow-up status immediately before sending.
async function canSendMessage(db, message) {
  const result = await db.query(
    `
      SELECT 1
      FROM follow_ups f
      INNER JOIN customer_communication_preferences p
        ON p.business_id = f.business_id
       AND p.customer_id = $3
       AND p.channel = 'email'
       AND p.consent_status = 'granted'
      WHERE f.business_id = $1
        AND f.id = $2
        AND f.status = 'pending'
    `,
    [
      message.business_id,
      message.follow_up_id,
      message.customer_id,
    ],
  );

  return result.rowCount > 0;
}

async function completeWithoutSending(db, message, workerId) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query(
      `
        UPDATE follow_up_messages
        SET status = 'cancelled',
            last_error = 'Message cancelled because consent or follow-up eligibility is no longer valid.',
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE business_id = $1
          AND id = $2
          AND status = 'processing'
          AND locked_by = $3
        RETURNING id
      `,
      [message.business_id, message.id, workerId],
    );

    if (updated.rowCount !== 1) {
      throw new Error("The worker no longer owns this message.");
    }

    await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'failed',
            error_message = 'Message was not sent because consent or follow-up eligibility is no longer valid.',
            attempted_at = NOW()
        WHERE business_id = $1
          AND message_id = $2
          AND attempt_number = $3
          AND status = 'processing'
      `,
      [message.business_id, message.id, message.attempt_count],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function completeSuccessfulDelivery(db, message, workerId, delivery) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const updated = await client.query(
      `
        UPDATE follow_up_messages
        SET status = 'sent',
            provider = $4,
            provider_message_id = $5,
            sent_at = NOW(),
            last_error = NULL,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE business_id = $1
          AND id = $2
          AND status = 'processing'
          AND locked_by = $3
        RETURNING id
      `,
      [
        message.business_id,
        message.id,
        workerId,
        delivery.provider,
        delivery.providerMessageId,
      ],
    );

    if (updated.rowCount !== 1) {
      throw new Error(
        "Email was accepted, but Beevo could not confirm ownership of the message record.",
      );
    }

    await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'sent',
            provider_message_id = $4,
            attempted_at = NOW()
        WHERE business_id = $1
          AND message_id = $2
          AND attempt_number = $3
          AND status = 'processing'
      `,
      [
        message.business_id,
        message.id,
        message.attempt_count,
        delivery.providerMessageId,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function recordFailedDelivery(db, message, workerId, error) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const retryDelayMinutes = Math.min(
      60,
      2 ** Math.max(0, message.attempt_count - 1),
    );

    const safeError = String(
      error?.message || "Email delivery failed.",
    ).slice(0, 1000);

    const updated = await client.query(
      `
        UPDATE follow_up_messages
        SET status = CASE
              WHEN attempt_count >= max_attempts THEN 'failed'
              ELSE 'pending'
            END,
            next_attempt_at = NOW() + ($4::INTEGER * INTERVAL '1 minute'),
            last_error = $5,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE business_id = $1
          AND id = $2
          AND status = 'processing'
          AND locked_by = $3
        RETURNING id
      `,
      [
        message.business_id,
        message.id,
        workerId,
        retryDelayMinutes,
        safeError,
      ],
    );

    if (updated.rowCount !== 1) {
      throw new Error("The worker no longer owns this message.");
    }

    await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'failed',
            error_message = $4,
            attempted_at = NOW()
        WHERE business_id = $1
          AND message_id = $2
          AND attempt_number = $3
          AND status = 'processing'
      `,
      [
        message.business_id,
        message.id,
        message.attempt_count,
        safeError,
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function processDueFollowUpMessages({
  batchSize = 10,
  workerId = randomUUID(),
  sendEmail = sendFollowUpEmail,
  db = pool,
} = {}) {
  const safeBatchSize = Math.max(
    1,
    Math.min(100, Math.floor(Number(batchSize) || 10)),
  );

  const messages = await claimDueMessages(
    db,
    workerId,
    safeBatchSize,
  );

  const results = [];

  for (const message of messages) {
    // Database eligibility errors must not be treated as provider errors.
    let eligible;

    try {
      eligible = await canSendMessage(db, message);
    } catch (error) {
      console.error(
        "Beevo could not verify message eligibility:",
        error.message,
      );
      results.push({
        id: message.id,
        status: "eligibility_check_error",
      });
      continue;
    }

    if (!eligible) {
      try {
        await completeWithoutSending(db, message, workerId);
        results.push({ id: message.id, status: "cancelled" });
      } catch (error) {
        console.error(
          "Beevo could not cancel an ineligible message:",
          error.message,
        );
        results.push({ id: message.id, status: "database_error" });
      }
      continue;
    }

    let delivery;

    // Only errors from the provider call are recorded as delivery failures.
    try {
      delivery = await sendEmail({
        to: message.recipient,
        subject: message.subject,
        body: message.body,
      });
    } catch (providerError) {
      try {
        await recordFailedDelivery(
          db,
          message,
          workerId,
          providerError,
        );
        results.push({
          id: message.id,
          status: "retry_recorded",
        });
      } catch (databaseError) {
        console.error(
          "Beevo could not record the provider failure:",
          databaseError.message,
        );
        results.push({
          id: message.id,
          status: "database_error",
        });
      }
      continue;
    }

    // If persistence fails after provider acceptance, do not classify it
    // as a provider failure or immediately schedule another attempt.
    try {
      await completeSuccessfulDelivery(
        db,
        message,
        workerId,
        delivery,
      );
      results.push({ id: message.id, status: "sent" });
    } catch (databaseError) {
      console.error(
        "Email provider accepted a message, but Beevo could not save its result:",
        databaseError.message,
      );
      results.push({
        id: message.id,
        status: "delivery_result_unknown",
      });
    }
  }

  return {
    processed: messages.length,
    results,
  };
}
