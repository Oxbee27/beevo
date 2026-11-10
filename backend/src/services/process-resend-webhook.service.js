import pool from "../config/database.js";

const DELIVERY_EVENTS = new Set([
  "email.delivered",
  "email.bounced",
  "email.failed",
]);

export async function processResendWebhookEvent({ eventId, event }) {
  if (!eventId || typeof eventId !== "string") {
    throw new Error("A valid webhook event ID is required.");
  }

  if (!event || typeof event.type !== "string") {
    throw new Error("A valid webhook event is required.");
  }

  const providerMessageId =
    typeof event.data?.email_id === "string"
      ? event.data.email_id
      : null;

  const parsedEventTime = Date.parse(event.created_at);
  const eventCreatedAt = Number.isFinite(parsedEventTime)
    ? new Date(parsedEventTime)
    : null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `
        INSERT INTO resend_webhook_events (
          provider_event_id,
          event_type,
          provider_message_id,
          event_created_at
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (provider_event_id) DO NOTHING
        RETURNING id
      `,
      [eventId, event.type, providerMessageId, eventCreatedAt],
    );

    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return { status: "duplicate" };
    }

    let processingResult = "ignored";

    if (DELIVERY_EVENTS.has(event.type) && providerMessageId) {
      if (!eventCreatedAt) {
        processingResult = "ignored";
      } else {
        const matched = await client.query(
          `
            SELECT id, business_id, status, provider_event_at
            FROM follow_up_messages
            WHERE provider = 'resend'
              AND channel = 'email'
              AND provider_message_id = $1
            FOR UPDATE
          `,
          [providerMessageId],
        );

        if (matched.rowCount === 0) {
          processingResult = "unmatched";
        } else {
          const message = matched.rows[0];
          const previousEventTime = message.provider_event_at
            ? new Date(message.provider_event_at).getTime()
            : null;

          if (
            previousEventTime !== null &&
            eventCreatedAt.getTime() <= previousEventTime
          ) {
            processingResult = "stale";
          } else if (message.status === "delivered") {
            // A confirmed delivery must never be downgraded by a failure event.
            processingResult = "already_final";
          } else if (["sent", "unknown", "failed"].includes(message.status)) {
            const isDelivered = event.type === "email.delivered";
            const outcome = isDelivered ? "delivered" : "failed";

            const failureMessage =
              event.type === "email.bounced"
                ? "The recipient's email address bounced."
                : "The email provider reported a delivery failure.";

            const updated = await client.query(
              `
                UPDATE follow_up_messages
                SET status = $3,
                    provider_event_at = $4,
                    sent_at = CASE
                      WHEN $3 = 'delivered' THEN COALESCE(sent_at, NOW())
                      ELSE sent_at
                    END,
                    delivered_at = CASE
                      WHEN $3 = 'delivered' THEN COALESCE(delivered_at, NOW())
                      ELSE delivered_at
                    END,
                    last_error = CASE
                      WHEN $3 = 'delivered' THEN NULL
                      ELSE $5
                    END,
                    updated_at = NOW()
                WHERE id = $1
                  AND business_id = $2
                  AND status IN ('sent', 'unknown', 'failed')
                  AND (
                    provider_event_at IS NULL
                    OR provider_event_at < $4
                  )
                RETURNING id
              `,
              [
                message.id,
                message.business_id,
                outcome,
                eventCreatedAt,
                isDelivered ? null : failureMessage,
              ],
            );

            if (updated.rowCount !== 1) {
              throw new Error("Could not update the matching Beevo message.");
            }

            const attempt = await client.query(
              `
                UPDATE message_delivery_attempts
                SET status = $3,
                    provider_message_id = $4,
                    error_message = $5
                WHERE id = (
                  SELECT id
                  FROM message_delivery_attempts
                  WHERE business_id = $1
                    AND message_id = $2
                  ORDER BY attempt_number DESC
                  LIMIT 1
                )
                  AND status IN ('processing', 'sent', 'unknown', 'failed')
                RETURNING id
              `,
              [
                message.business_id,
                message.id,
                isDelivered ? "sent" : "failed",
                providerMessageId,
                isDelivered ? null : failureMessage,
              ],
            );

            if (attempt.rowCount !== 1) {
              throw new Error("Could not update the matching delivery attempt.");
            }

            processingResult = "matched";
          } else {
            processingResult = "ignored";
          }
        }
      }
    }

    await client.query(
      `
        UPDATE resend_webhook_events
        SET processing_result = $2,
            processed_at = NOW()
        WHERE provider_event_id = $1
      `,
      [eventId, processingResult],
    );

    await client.query("COMMIT");

    return { status: processingResult };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
