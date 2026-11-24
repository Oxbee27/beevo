import { randomUUID } from "node:crypto";
import pool from "../config/database.js";

function conflict(message) {
  const error = new Error(message);
  error.statusCode = 409;
  return error;
}

export async function sendBusinessConversationReply({
  businessId,
  conversationId,
  userId,
  subject = null,
  body = "",
  templateKey = null,
  templateComponents = [],
  idempotencyKey = randomUUID(),
}) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `
        SELECT
          c.id,
          c.customer_id,
          c.contact_identifier,
          c.conversation_status,
          c.classification_status,
          c.channel_connection_id,
          ch.channel,
          ch.is_active,
          ch.connection_status
        FROM business_conversations c
        INNER JOIN business_communication_channels ch
          ON ch.business_id = c.business_id
         AND ch.id = c.channel_connection_id
        WHERE c.business_id = $1
          AND c.id = $2
        FOR UPDATE OF c
      `,
      [businessId, conversationId],
    );

    if (!result.rowCount) {
      await client.query("ROLLBACK");
      return { notFound: true };
    }

    const conversation = result.rows[0];

    if (conversation.classification_status !== "business") {
      throw conflict("Only approved business conversations can receive replies.");
    }

    if (!["open", "pending"].includes(conversation.conversation_status)) {
      throw conflict("Reopen this conversation before sending another reply.");
    }

    if (!conversation.customer_id) {
      throw conflict("Link this conversation to a customer before replying.");
    }

    if (
      !conversation.is_active ||
      conversation.connection_status !== "connected"
    ) {
      throw conflict("This communication channel is not currently connected.");
    }

    if (!["email", "sms", "whatsapp"].includes(conversation.channel)) {
      throw conflict("This communication channel is not supported for replies.");
    }

    if (!conversation.contact_identifier) {
      throw conflict("This conversation does not have a valid recipient.");
    }

    if (conversation.channel === "whatsapp") {
      if (!templateKey || !/^[a-z0-9_]+$/.test(templateKey)) {
        throw conflict("Enter a valid approved WhatsApp template name.");
      }

      if (!Array.isArray(templateComponents) || templateComponents.length > 1) {
        throw conflict("The WhatsApp template parameters are invalid.");
      }

      for (const component of templateComponents) {
        if (
          !component ||
          component.type !== "body" ||
          !Array.isArray(component.parameters) ||
          component.parameters.length > 20 ||
          component.parameters.some((parameter) =>
            !parameter ||
            parameter.type !== "text" ||
            typeof parameter.text !== "string" ||
            !parameter.text.trim() ||
            parameter.text.length > 1024
          )
        ) {
          throw conflict("The WhatsApp template parameters are invalid.");
        }
      }
    } else if (typeof body !== "string" || !body.trim()) {
      throw conflict("Enter a reply before sending.");
    }

    if (conversation.channel === "email" && (!subject || !subject.trim())) {
      throw conflict("An email subject is required.");
    }

    const messageBody = conversation.channel === "whatsapp"
      ? `WhatsApp template: ${templateKey}`
      : body.trim();

    const safeTemplateComponents = conversation.channel === "whatsapp"
      ? templateComponents
      : [];

    const consent = await client.query(
      `
        SELECT consent_status
        FROM customer_communication_preferences
        WHERE business_id = $1
          AND customer_id = $2
          AND channel = $3
        FOR SHARE
      `,
      [businessId, conversation.customer_id, conversation.channel],
    );

    if (consent.rows[0]?.consent_status !== "granted") {
      throw conflict("This customer has not granted consent for this communication channel.");
    }

    const existing = await client.query(
      `
        SELECT id, conversation_message_id, status
        FROM follow_up_messages
        WHERE business_id = $1
          AND idempotency_key = $2
        LIMIT 1
      `,
      [businessId, idempotencyKey],
    );

    if (existing.rowCount) {
      await client.query("COMMIT");
      return { duplicate: true, message: existing.rows[0] };
    }

    const timelineResult = await client.query(
      `
        INSERT INTO conversation_messages (
          business_id,
          conversation_id,
          channel_connection_id,
          direction,
          message_type,
          body,
          delivery_status,
          created_by,
          metadata
        )
        VALUES ($1, $2, $3, 'outbound', $4, $5, 'queued', $6, $7)
        RETURNING
          id, conversation_id, direction, message_type,
          body, delivery_status, created_at
      `,
      [
        businessId,
        conversationId,
        conversation.channel_connection_id,
        conversation.channel === "whatsapp" ? "template" : "text",
        messageBody,
        userId,
        JSON.stringify(
          conversation.channel === "whatsapp"
            ? { templateKey, templateComponents: safeTemplateComponents }
            : {}
        ),
      ],
    );

    const timelineMessage = timelineResult.rows[0];

    const queueResult = await client.query(
      `
        INSERT INTO follow_up_messages (
          business_id,
          source_type,
          follow_up_id,
          enquiry_id,
          restock_recipient_id,
          conversation_id,
          conversation_message_id,
          customer_id,
          channel,
          recipient,
          subject,
          body,
          template_key,
          template_components,
          status,
          scheduled_for,
          next_attempt_at,
          idempotency_key
        )
        VALUES (
          $1, 'conversation', NULL, NULL, NULL, $2, $3, $4, $5,
          $6, $7, $8, $9, $10::JSONB, 'pending', NOW(), NOW(), $11
        )
        RETURNING
          id, status, channel, conversation_id,
          conversation_message_id, created_at
      `,
      [
        businessId,
        conversationId,
        timelineMessage.id,
        conversation.customer_id,
        conversation.channel,
        conversation.contact_identifier,
        subject,
        messageBody,
        templateKey,
        JSON.stringify(safeTemplateComponents),
        idempotencyKey,
      ],
    );

    await client.query(
      `
        UPDATE business_conversations
        SET last_message_at = NOW(), updated_at = NOW()
        WHERE business_id = $1 AND id = $2
      `,
      [businessId, conversationId],
    );

    await client.query("COMMIT");

    return {
      duplicate: false,
      message: queueResult.rows[0],
      conversationMessage: timelineMessage,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
