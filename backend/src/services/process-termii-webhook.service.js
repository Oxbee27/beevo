import pool from "../config/database.js";

const DELIVERY_STATUSES = new Map([
  ["DELIVERED", "delivered"],
  ["MESSAGE SENT", "sent"],
  ["MESSAGE FAILED", "failed"],
  ["DND ACTIVE ON PHONE NUMBER", "failed"],
  ["REJECTED", "failed"],
  ["EXPIRED", "failed"],
]);

export async function applyTermiiDeliveryStatus(
  client,
  { message, providerMessageId, rawStatus },
) {
  const normalizedStatus =
    typeof rawStatus === "string" ? rawStatus.trim().toUpperCase() : "";

  const outcome = DELIVERY_STATUSES.get(normalizedStatus);

  if (!outcome) return "ignored";

  if (message.status === "delivered") {
    return "already_final";
  }

  if (
    outcome === "sent" &&
    !["sent", "unknown"].includes(message.status)
  ) {
    return "already_final";
  }

  if (!["sent", "delivered", "failed", "unknown"].includes(outcome)) {
    return "ignored";
  }

  if (!["sent", "unknown", "failed"].includes(message.status)) {
    return "ignored";
  }

  const isFailure = outcome === "failed";

  const failureMessage = {
    "MESSAGE FAILED": "Termii reported that SMS delivery failed.",
    "DND ACTIVE ON PHONE NUMBER":
      "The recipient's number has DND enabled.",
    REJECTED: "Termii rejected the SMS delivery.",
    EXPIRED: "The SMS delivery expired before reaching the recipient.",
  }[normalizedStatus] || null;

  const updated = await client.query(
    `
      UPDATE follow_up_messages
      SET status = $3,
          provider_event_at = NOW(),
          sent_at = COALESCE(sent_at, NOW()),
          delivered_at = CASE
            WHEN $3 = 'delivered' THEN COALESCE(delivered_at, NOW())
            ELSE delivered_at
          END,
          last_error = CASE
            WHEN $3 = 'delivered' THEN NULL
            WHEN $3 = 'failed' THEN $4
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE id = $1
        AND business_id = $2
        AND provider = 'termii'
        AND channel = 'sms'
        AND status IN ('sent', 'unknown', 'failed')
      RETURNING id
    `,
    [
      message.id,
      message.business_id,
      outcome,
      isFailure ? failureMessage : null,
    ],
  );

  if (updated.rowCount !== 1) {
    throw new Error("Could not update the matching Beevo SMS message.");
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
          AND provider = 'termii'
        ORDER BY attempt_number DESC
        LIMIT 1
      )
        AND status IN ('processing', 'sent', 'unknown', 'failed')
      RETURNING id
    `,
    [
      message.business_id,
      message.id,
      isFailure ? "failed" : "sent",
      providerMessageId,
      isFailure ? failureMessage : null,
    ],
  );

  if (attempt.rowCount !== 1) {
    throw new Error(
      "Could not update the matching Termii delivery attempt.",
    );
  }

  return "matched";
}

export async function processTermiiWebhookEvent({
  eventFingerprint,
  event,
}) {
  if (
    typeof eventFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(eventFingerprint)
  ) {
    throw new Error("A valid Termii event fingerprint is required.");
  }

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("A valid Termii webhook event is required.");
  }

  const providerMessageId =
    typeof event.message_id === "string" ||
    typeof event.message_id === "number"
      ? String(event.message_id)
      : null;

  const rawStatus =
    typeof event.status === "string" ? event.status.trim() : "";

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Serialize webhook processing and worker reconciliation for this ID.
    if (providerMessageId) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`termii:${providerMessageId}`],
      );
    }

    const inserted = await client.query(
      `
        INSERT INTO termii_webhook_events (
          event_fingerprint,
          provider_message_id,
          event_status
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (event_fingerprint) DO NOTHING
        RETURNING id
      `,
      [eventFingerprint, providerMessageId, rawStatus || null],
    );

    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return { status: "duplicate" };
    }

    let processingResult = "ignored";

    if (
      providerMessageId &&
      DELIVERY_STATUSES.has(rawStatus.toUpperCase())
    ) {
      const matched = await client.query(
        `
          SELECT id, business_id, status
          FROM follow_up_messages
          WHERE provider = 'termii'
            AND channel = 'sms'
            AND provider_message_id = $1
          FOR UPDATE
        `,
        [providerMessageId],
      );

      if (matched.rowCount === 0) {
        processingResult = DELIVERY_STATUSES.has(rawStatus.toUpperCase())
          ? "unmatched"
          : "ignored";
      } else {
        processingResult = await applyTermiiDeliveryStatus(client, {
          message: matched.rows[0],
          providerMessageId,
          rawStatus,
        });
      }
    }

    await client.query(
      `
        UPDATE termii_webhook_events
        SET processing_result = $2,
            processed_at = NOW()
        WHERE event_fingerprint = $1
      `,
      [eventFingerprint, processingResult],
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


export function nextTermiiMessageStatus(
  currentStatus,
  rawStatus,
  processingResult,
) {
  if (processingResult !== "matched") return currentStatus;

  const normalizedStatus =
    typeof rawStatus === "string" ? rawStatus.trim().toUpperCase() : "";

  return DELIVERY_STATUSES.get(normalizedStatus) || currentStatus;
}
