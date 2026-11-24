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
          m.source_type,
          m.conversation_id,
          m.conversation_message_id,
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
            FROM business_conversations c
            INNER JOIN business_communication_channels ch
              ON ch.business_id = c.business_id
             AND ch.id = c.channel_connection_id
            WHERE c.business_id = m.business_id
              AND c.id = m.conversation_id
              AND c.customer_id = m.customer_id
              AND c.classification_status = 'business'
              AND c.conversation_status IN ('open', 'pending')
              AND ch.channel = m.channel
              AND ch.is_active = TRUE
              AND ch.connection_status = 'connected'
          ) AS conversation_eligible,
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

    const sourceIsEligible = message.source_type === "conversation"
      ? message.conversation_eligible
      : message.follow_up_pending;

    if (!sourceIsEligible || !message.consent_granted) {
      await client.query("COMMIT");
      return {
        message,
        conflict: true,
        reason: "The conversation or follow-up, or customer consent, is no longer eligible for delivery.",
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

    if (message.source_type === "conversation") {
      await client.query(
        `
          UPDATE conversation_messages
          SET delivery_status = 'queued'
          WHERE business_id = $1
            AND conversation_id = $2
            AND id = $3
            AND direction = 'outbound'
        `,
        [businessId, message.conversation_id, message.conversation_message_id],
      );
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
