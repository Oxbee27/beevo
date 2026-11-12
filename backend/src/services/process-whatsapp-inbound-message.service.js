import pool from "../config/database.js";

const MESSAGE_TYPES = new Set([
  "text",
  "template",
  "image",
  "document",
  "audio",
  "video",
  "location",
  "interactive",
  "other",
]);

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function processWhatsAppInboundMessage({
  phoneNumberId,
  contactIdentifier,
  contactDisplayName = null,
  providerMessageId,
  messageType = "other",
  body = null,
  receivedAt,
  db = pool,
}) {
  if (
    !phoneNumberId ||
    !/^\d+$/.test(String(phoneNumberId)) ||
    !contactIdentifier ||
    !providerMessageId
  ) {
    return { processed: false, reason: "invalid_message" };
  }

  const receivedDate = validDate(receivedAt) || new Date();
  const safeMessageType = MESSAGE_TYPES.has(messageType)
    ? messageType
    : "other";

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const channelResult = await client.query(
      `SELECT id, business_id
       FROM business_communication_channels
       WHERE channel = 'whatsapp'
         AND provider = 'meta_whatsapp'
         AND external_channel_id = $1
         AND connection_status = 'connected'
         AND is_active = TRUE
       FOR SHARE`,
      [String(phoneNumberId)],
    );

    if (channelResult.rowCount === 0) {
      await client.query("COMMIT");
      return { processed: false, reason: "channel_not_connected" };
    }

    const channel = channelResult.rows[0];

    const conversationResult = await client.query(
      `INSERT INTO business_conversations (
         business_id,
         channel_connection_id,
         contact_identifier,
         contact_display_name,
         last_message_at
       )
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (
         business_id,
         channel_connection_id,
         contact_identifier
       )
       DO UPDATE SET
         contact_display_name = COALESCE(
           EXCLUDED.contact_display_name,
           business_conversations.contact_display_name
         ),
         updated_at = NOW()
       RETURNING id, classification_status`,
      [
        channel.business_id,
        channel.id,
        String(contactIdentifier),
        contactDisplayName,
        receivedDate,
      ],
    );

    const conversation = conversationResult.rows[0];

    // Never persist inbound message content for unclassified or excluded
    // conversations. Staff must explicitly classify it as business first.
    if (conversation.classification_status !== "business") {
      await client.query(
        `UPDATE business_conversations
         SET last_message_at = GREATEST(
               COALESCE(last_message_at, $2),
               $2
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id, receivedDate],
      );

      await client.query("COMMIT");

      return {
        processed: true,
        stored: false,
        reason: conversation.classification_status,
        conversationId: conversation.id,
      };
    }

    const messageResult = await client.query(
      `INSERT INTO conversation_messages (
         business_id,
         conversation_id,
         channel_connection_id,
         direction,
         provider_message_id,
         message_type,
         body,
         delivery_status,
         received_at
       )
       VALUES ($1, $2, $3, 'inbound', $4, $5, $6, 'received', $7)
       ON CONFLICT (channel_connection_id, provider_message_id)
       WHERE provider_message_id IS NOT NULL
       DO NOTHING
       RETURNING id`,
      [
        channel.business_id,
        conversation.id,
        channel.id,
        String(providerMessageId),
        safeMessageType,
        typeof body === "string" ? body : null,
        receivedDate,
      ],
    );

    if (messageResult.rowCount > 0) {
      await client.query(
        `UPDATE business_conversations
         SET last_message_at = GREATEST(
               COALESCE(last_message_at, $2),
               $2
             ),
             updated_at = NOW()
         WHERE id = $1`,
        [conversation.id, receivedDate],
      );
    }

    await client.query("COMMIT");

    return {
      processed: true,
      stored: messageResult.rowCount > 0,
      duplicate: messageResult.rowCount === 0,
      reason: messageResult.rowCount > 0 ? "stored" : "duplicate",
      conversationId: conversation.id,
      messageId: messageResult.rows[0]?.id ?? null,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
