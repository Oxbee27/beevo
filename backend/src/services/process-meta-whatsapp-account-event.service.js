import pool from "../config/database.js";

const SUPPORTED_FIELDS = new Set([
  "account_update",
  "account_review_update",
  "phone_number_quality_update",
  "phone_number_name_update",
]);

const SENSITIVE_KEYS = new Set([
  "access_token",
  "token",
  "authorization",
  "app_secret",
  "client_secret",
  "pin",
  "password",
]);

function normalizeIdentifier(value) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value).trim();

  return normalized && normalized.length <= 255
    ? normalized
    : null;
}

function sanitizeValue(value, depth = 0) {
  if (depth > 4) return null;

  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return value.slice(0, 1000);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeValue(item, depth + 1));
  }

  if (typeof value !== "object") return null;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEYS.has(key.toLowerCase()))
      .slice(0, 50)
      .map(([key, item]) => [
        key.slice(0, 100),
        sanitizeValue(item, depth + 1),
      ]),
  );
}

function buildMetadataPatch(field, eventPayload) {
  return {
    lastEventAt: new Date().toISOString(),
    [field]: eventPayload,
  };
}

export async function processMetaWhatsAppAccountEvent({
  eventFingerprint,
  field,
  externalAccountId,
  phoneNumberId,
  event,
}) {
  if (
    typeof eventFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(eventFingerprint)
  ) {
    throw new Error("A valid Meta account event fingerprint is required.");
  }

  if (!SUPPORTED_FIELDS.has(field)) {
    return { status: "ignored" };
  }

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("A valid Meta account event payload is required.");
  }

  const accountId = normalizeIdentifier(externalAccountId);
  const channelId = normalizeIdentifier(phoneNumberId);

  if (!accountId && !channelId) {
    return { status: "ignored" };
  }

  let eventPayload = sanitizeValue(event);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [`meta-whatsapp-account:${eventFingerprint}`],
    );

    const inserted = await client.query(
      `
        INSERT INTO meta_whatsapp_account_webhook_events (
          event_fingerprint,
          event_field,
          external_account_id,
          external_channel_id,
          event_payload
        )
        VALUES ($1, $2, $3, $4, $5::jsonb)
        ON CONFLICT (event_fingerprint) DO NOTHING
        RETURNING id
      `,
      [
        eventFingerprint,
        field,
        accountId,
        channelId,
        JSON.stringify(eventPayload),
      ],
    );

    if (inserted.rowCount === 0) {
      const existing = await client.query(
        `
          SELECT
            id,
            event_field,
            external_account_id,
            external_channel_id,
            event_payload,
            processing_result
          FROM meta_whatsapp_account_webhook_events
          WHERE event_fingerprint = $1
          FOR UPDATE
        `,
        [eventFingerprint],
      );

      if (
        existing.rowCount !== 1 ||
        existing.rows[0].processing_result !== "unmatched"
      ) {
        await client.query("COMMIT");
        return { status: "duplicate" };
      }

      const previous = existing.rows[0];

      field = previous.event_field;
      eventPayload = previous.event_payload;
      const previousAccountId = previous.external_account_id;
      const previousChannelId = previous.external_channel_id;

      const matched = await updateMatchingChannels(
        client,
        field,
        eventPayload,
        previousAccountId,
        previousChannelId,
      );

      const status = matched ? "matched" : "unmatched";

      await client.query(
        `
          UPDATE meta_whatsapp_account_webhook_events
          SET processing_result = $2,
              processed_at = NOW()
          WHERE event_fingerprint = $1
        `,
        [eventFingerprint, status],
      );

      await client.query("COMMIT");
      return { status };
    }

    const matched = await updateMatchingChannels(
      client,
      field,
      eventPayload,
      accountId,
      channelId,
    );

    const status = matched ? "matched" : "unmatched";

    await client.query(
      `
        UPDATE meta_whatsapp_account_webhook_events
        SET processing_result = $2,
            processed_at = NOW()
        WHERE event_fingerprint = $1
      `,
      [eventFingerprint, status],
    );

    await client.query("COMMIT");
    return { status };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function updateMatchingChannels(
  client,
  field,
  eventPayload,
  accountId,
  channelId,
) {
  const metadataPatch = buildMetadataPatch(field, eventPayload);

  const updated = await client.query(
    `
      UPDATE business_communication_channels
      SET metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{metaWebhook}',
            COALESCE(metadata->'metaWebhook', '{}'::jsonb)
              || $1::jsonb,
            true
          ),
          updated_at = NOW()
      WHERE provider = 'meta_whatsapp'
        AND channel = 'whatsapp'
        AND (
          (
            $2::text IS NOT NULL
            AND external_account_id = $2
            AND (
              $3::text IS NULL
              OR external_channel_id = $3
            )
          )
          OR (
            $2::text IS NULL
            AND $3::text IS NOT NULL
            AND external_channel_id = $3
          )
        )
      RETURNING id
    `,
    [
      JSON.stringify(metadataPatch),
      accountId,
      channelId,
    ],
  );

  return updated.rowCount > 0;
}
