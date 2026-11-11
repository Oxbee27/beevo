import { randomUUID } from "node:crypto";
import pool from "../config/database.js";
import { sendFollowUpEmail } from "../utils/send-follow-up-email.js";
import { sendFollowUpSms } from "../utils/send-follow-up-sms.js";
import { sendFollowUpWhatsApp } from "../utils/send-follow-up-whatsapp.js";
import { applyWhatsAppDeliveryStatus } from "../services/process-whatsapp-webhook.service.js";
import {
  applyTermiiDeliveryStatus,
  nextTermiiMessageStatus,
} from "../services/process-termii-webhook.service.js";

async function claimDueMessages(db, workerId, batchSize, messageId = null) {
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
          AND ($1::BIGINT IS NULL OR m.id = $1)
          AND a.attempt_number = m.attempt_count
          AND a.status = 'processing'
      `,
      [messageId],
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
          AND ($1::BIGINT IS NULL OR id = $1)
      `,
      [messageId],
    );

    // Cancel messages when consent has been withdrawn.
    await client.query(
      `
        UPDATE follow_up_messages m
        SET status = 'cancelled',
            last_error = 'Message delivery skipped because customer consent is not granted.',
            updated_at = NOW()
        WHERE m.status = 'pending'
          AND NOT EXISTS (
            SELECT 1
            FROM customer_communication_preferences p
            WHERE p.business_id = m.business_id
              AND p.customer_id = m.customer_id
              AND p.channel = m.channel
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
          AND ($1::BIGINT IS NULL OR m.id = $1)
          AND EXISTS (
            SELECT 1
            FROM follow_ups f
            WHERE f.business_id = m.business_id
              AND f.id = m.follow_up_id
              AND f.status <> 'pending'
          )
      `,
      [messageId],
    );

    const dueResult = await client.query(
      `
        SELECT m.*
        FROM follow_up_messages m
        INNER JOIN customer_communication_preferences p
          ON p.business_id = m.business_id
         AND p.customer_id = m.customer_id
         AND p.channel = m.channel
         AND p.consent_status = 'granted'
        INNER JOIN follow_ups f
          ON f.business_id = m.business_id
         AND f.id = m.follow_up_id
         AND f.status = 'pending'
        WHERE m.status = 'pending'
          AND m.channel IN ('email', 'sms', 'whatsapp')
          AND ($2::BIGINT IS NULL OR m.id = $2)
          AND m.scheduled_for <= NOW()
          AND m.next_attempt_at <= NOW()
        ORDER BY m.next_attempt_at ASC, m.id ASC
        LIMIT $1
        FOR UPDATE OF m SKIP LOCKED
      `,
      [batchSize, messageId],
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
          VALUES (
            $1, $2, $3,
            CASE
              WHEN $4 = 'sms' THEN 'termii'
              WHEN $4 = 'whatsapp' THEN 'meta_whatsapp'
              ELSE 'resend'
            END,
            'processing'
          )
        `,
        [
          current.business_id,
          current.id,
          current.attempt_count,
          current.channel,
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
       AND p.channel = $4
       AND p.consent_status = 'granted'
      WHERE f.business_id = $1
        AND f.id = $2
        AND f.status = 'pending'
    `,
    [
      message.business_id,
      message.follow_up_id,
      message.customer_id,
      message.channel,
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
        WHERE business_id = $1 AND id = $2
          AND status = 'processing' AND locked_by = $3
        RETURNING id
      `,
      [message.business_id, message.id, workerId],
    );

    if (updated.rowCount !== 1) {
      throw new Error("The worker no longer owns this message.");
    }

    const attemptUpdated = await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'failed',
            error_message = 'Message was not sent because consent or follow-up eligibility is no longer valid.',
            attempted_at = NOW()
        WHERE business_id = $1 AND message_id = $2
          AND attempt_number = $3 AND status = 'processing'
      `,
      [message.business_id, message.id, message.attempt_count],
    );

    if (attemptUpdated.rowCount !== 1) {
      throw new Error("Beevo could not confirm the delivery-attempt record.");
    }


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

    // Serialize provider-ID persistence with incoming Termii webhooks.
    if (delivery.provider === "termii" && message.channel === "sms") {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`termii:${delivery.providerMessageId}`],
      );
    }

    if (delivery.provider === "meta_whatsapp" && message.channel === "whatsapp") {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`whatsapp:${delivery.providerMessageId}`],
      );
    }

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
        WHERE business_id = $1 AND id = $2
          AND status = 'processing' AND locked_by = $3
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
        "The provider accepted the message, but Beevo could not confirm ownership of the message record.",
      );
    }

    const attemptUpdated = await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'sent',
            provider_message_id = $4,
            attempted_at = NOW()
        WHERE business_id = $1 AND message_id = $2
          AND attempt_number = $3 AND status = 'processing'
      `,
      [
        message.business_id,
        message.id,
        message.attempt_count,
        delivery.providerMessageId,
      ],
    );

    if (attemptUpdated.rowCount !== 1) {
      throw new Error("Beevo could not confirm the delivery-attempt record.");
    }

    // A Termii webhook may have arrived before the provider ID was saved.
    // Process those events now, without depending on provider retries.
    if (delivery.provider === "termii" && message.channel === "sms") {
      const unmatchedEvents = await client.query(
        `
          SELECT id, event_status
          FROM termii_webhook_events
          WHERE provider_message_id = $1
            AND processing_result = 'unmatched'
          ORDER BY id
          FOR UPDATE
        `,
        [delivery.providerMessageId],
      );

      let reconciledMessageStatus = "sent";

      for (const event of unmatchedEvents.rows) {
        const reconciliationResult = await applyTermiiDeliveryStatus(
          client,
          {
            message: {
              id: message.id,
              business_id: message.business_id,
              status: reconciledMessageStatus,
            },
            providerMessageId: delivery.providerMessageId,
            rawStatus: event.event_status,
          },
        );

        reconciledMessageStatus = nextTermiiMessageStatus(
          reconciledMessageStatus,
          event.event_status,
          reconciliationResult,
        );



        await client.query(
          `
            UPDATE termii_webhook_events
            SET processing_result = $2,
                processed_at = NOW()
            WHERE id = $1
              AND processing_result = 'unmatched'
          `,
          [event.id, reconciliationResult],
        );
      }
    }


    // Reconcile Meta webhook events received before the wamid was persisted.
    if (delivery.provider === "meta_whatsapp" && message.channel === "whatsapp") {
      const unmatchedEvents = await client.query(
        `
          SELECT id, event_status, provider_event_at, error_message
          FROM whatsapp_webhook_events
          WHERE provider_message_id = $1
            AND processing_result = 'unmatched'
          ORDER BY provider_event_at ASC NULLS LAST, id ASC
          FOR UPDATE
        `,
        [delivery.providerMessageId],
      );

      let reconciledMessage = {
        id: message.id,
        business_id: message.business_id,
        status: "sent",
        provider_event_at: null,
      };

      for (const event of unmatchedEvents.rows) {
        const reconciliationResult = await applyWhatsAppDeliveryStatus(
          client,
          {
            message: reconciledMessage,
            providerMessageId: delivery.providerMessageId,
            rawStatus: event.event_status,
            providerEventAt: event.provider_event_at,
            errorMessage: event.error_message,
          },
        );

        if (reconciliationResult === "matched") {
          const outcome = event.event_status === "failed"
            ? "failed"
            : ["delivered", "read"].includes(event.event_status)
              ? "delivered"
              : "sent";

          reconciledMessage.status = outcome;
          reconciledMessage.provider_event_at = event.provider_event_at;
        }

        await client.query(
          `
            UPDATE whatsapp_webhook_events
            SET processing_result = $2,
                processed_at = NOW()
            WHERE id = $1
              AND processing_result = 'unmatched'
          `,
          [event.id, reconciliationResult],
        );
      }
    }

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
      error?.message || "Message delivery failed.",
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
        WHERE business_id = $1 AND id = $2
          AND status = 'processing' AND locked_by = $3
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

    const attemptUpdated = await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'failed',
            error_message = $4,
            attempted_at = NOW()
        WHERE business_id = $1 AND message_id = $2
          AND attempt_number = $3 AND status = 'processing'
      `,
      [
        message.business_id,
        message.id,
        message.attempt_count,
        safeError,
      ],
    );

    if (attemptUpdated.rowCount !== 1) {
      throw new Error("Beevo could not confirm the delivery-attempt record.");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}



async function recordUnknownDelivery(db, message, workerId, error) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const safeError = String(
      error?.message || "The message delivery outcome could not be confirmed.",
    ).slice(0, 1000);

    const updated = await client.query(
      `
        UPDATE follow_up_messages
        SET status = 'unknown',
            last_error = $4,
            locked_at = NULL,
            locked_by = NULL,
            updated_at = NOW()
        WHERE business_id = $1 AND id = $2
          AND status = 'processing' AND locked_by = $3
        RETURNING id
      `,
      [message.business_id, message.id, workerId, safeError],
    );

    if (updated.rowCount !== 1) {
      throw new Error("The worker no longer owns this message.");
    }

    const attemptUpdated = await client.query(
      `
        UPDATE message_delivery_attempts
        SET status = 'unknown',
            error_message = $4,
            attempted_at = NOW()
        WHERE business_id = $1 AND message_id = $2
          AND attempt_number = $3 AND status = 'processing'
      `,
      [
        message.business_id,
        message.id,
        message.attempt_count,
        safeError,
      ],
    );

    if (attemptUpdated.rowCount !== 1) {
      throw new Error("Beevo could not confirm the delivery-attempt record.");
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function renewMessageLocks(db, workerId, activeIds) {
  if (activeIds.size === 0) return;

  const ids = [...activeIds];

  const result = await db.query(
    `
      UPDATE follow_up_messages
      SET locked_at = NOW(),
          updated_at = NOW()
      WHERE id = ANY($2)
        AND status = 'processing'
        AND locked_by = $1
      RETURNING id
    `,
    [workerId, ids],
  );

  const renewed = new Set(result.rows.map((row) => String(row.id)));

  for (const id of ids) {
    if (!renewed.has(String(id))) {
      throw new Error("The worker lost its delivery-message lock.");
    }
  }
}

export async function processDueFollowUpMessages({
  batchSize = 10,
  workerId = randomUUID(),
  sendEmail = sendFollowUpEmail,
  sendSms = sendFollowUpSms,
  sendWhatsApp = sendFollowUpWhatsApp,
  messageId = null,
  db = pool,
  heartbeatIntervalMs = 60_000,
} = {}) {
  const safeMessageId =
    messageId === null || messageId === undefined
      ? null
      : Number.isSafeInteger(Number(messageId)) && Number(messageId) > 0
        ? Number(messageId)
        : (() => { throw new Error("A valid positive message ID is required."); })();

  const safeBatchSize = safeMessageId
    ? 1
    : Math.max(1, Math.min(100, Math.floor(Number(batchSize) || 10)));

  const messages = await claimDueMessages(
    db,
    workerId,
    safeBatchSize,
    safeMessageId,
  );
  const results = [];
  const activeIds = new Set(messages.map((message) => String(message.id)));

  let heartbeatFailed = false;
  let heartbeatInFlight = null;

  const timer = messages.length
    ? setInterval(() => {
        if (heartbeatFailed || heartbeatInFlight || activeIds.size === 0) {
          return;
        }

        heartbeatInFlight = renewMessageLocks(db, workerId, activeIds)
          .catch((error) => {
            heartbeatFailed = true;
            console.error("Beevo could not renew message locks:", error.message);
          })
          .finally(() => {
            heartbeatInFlight = null;
          });
      }, Math.max(1000, Number(heartbeatIntervalMs) || 60_000))
    : null;

  try {
    for (const message of messages) {
      const id = String(message.id);

      try {
        if (heartbeatFailed) {
          results.push({ id: message.id, status: "lease_lost" });
          continue;
        }

        let eligible;

        try {
          eligible = await canSendMessage(db, message);
        } catch (error) {
          console.error("Beevo could not verify message eligibility:", error.message);
          results.push({ id: message.id, status: "eligibility_check_error" });
          continue;
        }

        if (!eligible) {
          try {
            await completeWithoutSending(db, message, workerId);
            results.push({ id: message.id, status: "cancelled" });
          } catch (error) {
            console.error("Beevo could not cancel an ineligible message:", error.message);
            results.push({ id: message.id, status: "database_error" });
          }
          continue;
        }

        let delivery;

        try {
          if (message.channel === "sms") {
            delivery = await sendSms({
              to: message.recipient,
              body: message.body,
            });
          } else if (message.channel === "whatsapp") {
            if (!message.template_key) {
              const error = new Error(
                "An approved WhatsApp template is required.",
              );
              error.deliveryOutcome = "rejected";
              throw error;
            }

            delivery = await sendWhatsApp({
              to: message.recipient,
              templateName: message.template_key,
            });
          } else if (message.channel === "email") {
            delivery = await sendEmail({
              to: message.recipient,
              subject: message.subject,
              body: message.body,
            });
          } else {
            throw new Error("This message channel is not supported by the worker.");
          }
        } catch (providerError) {
          try {
            if (providerError?.deliveryOutcome === "rejected") {
              await recordFailedDelivery(db, message, workerId, providerError);
              results.push({ id: message.id, status: "retry_recorded" });
            } else {
              await recordUnknownDelivery(db, message, workerId, providerError);
              results.push({ id: message.id, status: "unknown" });
            }
          } catch (databaseError) {
            console.error("Beevo could not record the provider outcome:", databaseError.message);
            results.push({ id: message.id, status: "database_error" });
          }
          continue;
        }

        try {
          await completeSuccessfulDelivery(db, message, workerId, delivery);
          results.push({ id: message.id, status: "sent" });
        } catch (databaseError) {
          console.error(
            "Message provider accepted a message, but Beevo could not save its result:",
            databaseError.message,
          );
          results.push({ id: message.id, status: "delivery_result_unknown" });
        }
      } finally {
        activeIds.delete(id);
      }
    }
  } finally {
    if (timer) clearInterval(timer);
    if (heartbeatInFlight) await heartbeatInFlight;
  }

  return { processed: messages.length, results };
}
