import pool from "../config/database.js";

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function statusOutcome(status) {
  if (status === "sent") return "sent";
  if (status === "delivered" || status === "read") return "delivered";
  if (status === "failed") return "failed";
  return null;
}

export async function applyWhatsAppDeliveryStatus(
  client,
  { message, providerMessageId, rawStatus, providerEventAt, errorMessage },
) {
  const outcome = statusOutcome(normalizeStatus(rawStatus));

  if (!outcome) return "ignored";

  const eventDate = new Date(providerEventAt);
  if (!Number.isFinite(eventDate.getTime())) return "ignored";

  if (message.provider_event_at) {
    const previousDate = new Date(message.provider_event_at);
    if (
      Number.isFinite(previousDate.getTime()) &&
      eventDate.getTime() <= previousDate.getTime()
    ) {
      return "stale";
    }
  }

  if (message.status === "delivered") return "already_final";

  if (outcome === "sent" && message.status === "failed") {
    return "already_final";
  }

  if (!["sent", "unknown", "failed"].includes(message.status)) {
    return "ignored";
  }

  const failure = outcome === "failed"
    ? String(errorMessage || "Meta reported that WhatsApp delivery failed.").slice(0, 1000)
    : null;

  const updated = await client.query(
    `
      UPDATE follow_up_messages
      SET status = $3,
          provider_event_at = $4,
          sent_at = CASE
            WHEN $3 IN ('sent', 'delivered') THEN COALESCE(sent_at, $4)
            ELSE sent_at
          END,
          delivered_at = CASE
            WHEN $3 = 'delivered' THEN COALESCE(delivered_at, $4)
            ELSE delivered_at
          END,
          last_error = CASE
            WHEN $3 = 'failed' THEN $5
            ELSE NULL
          END,
          updated_at = NOW()
      WHERE business_id = $1
        AND id = $2
        AND provider = 'meta_whatsapp'
        AND channel = 'whatsapp'
        AND status IN ('sent', 'unknown', 'failed')
      RETURNING id
    `,
    [
      message.business_id,
      message.id,
      outcome,
      eventDate,
      failure,
    ],
  );

  if (updated.rowCount !== 1) {
    throw new Error("Could not update the matching Beevo WhatsApp message.");
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
          AND provider = 'meta_whatsapp'
        ORDER BY attempt_number DESC
        LIMIT 1
      )
        AND status IN ('processing', 'sent', 'unknown', 'failed')
      RETURNING id
    `,
    [
      message.business_id,
      message.id,
      outcome === "failed" ? "failed" : "sent",
      providerMessageId,
      failure,
    ],
  );

  if (attempt.rowCount !== 1) {
    throw new Error("Could not update the matching WhatsApp delivery attempt.");
  }

  return "matched";
}

export async function processWhatsAppWebhookEvent({ eventFingerprint, event }) {
  if (
    typeof eventFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(eventFingerprint)
  ) {
    throw new Error("A valid WhatsApp event fingerprint is required.");
  }

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("A valid WhatsApp webhook event is required.");
  }

  const providerMessageId =
    typeof event.id === "string" ? event.id : null;
  const rawStatus = normalizeStatus(event.status);
  const timestamp = Number(event.timestamp);
  const providerEventAt = Number.isFinite(timestamp)
    ? new Date(timestamp * 1000)
    : null;

  const errorMessage = Array.isArray(event.errors)
    ? event.errors
        .map((item) => [item?.title, item?.message, item?.error_data?.details]
          .filter((part) => typeof part === "string")
          .join(": "))
        .filter(Boolean)
        .join("; ")
        .slice(0, 1000)
    : null;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (providerMessageId) {
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`whatsapp:${providerMessageId}`],
      );
    }

    const inserted = await client.query(
      `
        INSERT INTO whatsapp_webhook_events (
          event_fingerprint,
          provider_message_id,
          event_status,
          provider_event_at,
          error_message
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (event_fingerprint) DO NOTHING
        RETURNING id
      `,
      [
        eventFingerprint,
        providerMessageId,
        rawStatus || null,
        providerEventAt,
        errorMessage,
      ],
    );

    if (inserted.rowCount === 0) {
      await client.query("COMMIT");
      return { status: "duplicate" };
    }

    let processingResult = "ignored";

    if (
      providerMessageId &&
      providerEventAt &&
      statusOutcome(rawStatus)
    ) {
      const matched = await client.query(
        `
          SELECT id, business_id, status, provider_event_at
          FROM follow_up_messages
          WHERE provider = 'meta_whatsapp'
            AND channel = 'whatsapp'
            AND provider_message_id = $1
          FOR UPDATE
        `,
        [providerMessageId],
      );

      if (matched.rowCount === 0) {
        processingResult = "unmatched";
      } else {
        processingResult = await applyWhatsAppDeliveryStatus(client, {
          message: matched.rows[0],
          providerMessageId,
          rawStatus,
          providerEventAt,
          errorMessage,
        });
      }
    }

    await client.query(
      `
        UPDATE whatsapp_webhook_events
        SET processing_result = $2,
            processed_at = NOW()
        WHERE event_fingerprint = $1
      `,
      [eventFingerprint, processingResult],
    );

    await client.query("COMMIT");
    return { status: processingResult };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
