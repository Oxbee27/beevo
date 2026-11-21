import pool from "../config/database.js";

export async function classifyBusinessConversation({
  businessId,
  conversationId,
  classification,
  customerId = null,
  preserveCustomer = false,
  userId,
}) {
  if (!["business", "excluded"].includes(classification)) {
    return {
      conflict: true,
      reason: "Choose a valid conversation classification.",
    };
  }

  if (classification === "excluded" && customerId !== null) {
    return {
      conflict: true,
      reason: "Excluded conversations cannot be linked to a customer.",
    };
  }

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const conversationResult = await client.query(
      `SELECT id, classification_status
       FROM business_conversations
       WHERE business_id = $1 AND id = $2
       FOR UPDATE`,
      [businessId, conversationId],
    );

    if (conversationResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return { conflict: true, reason: "Conversation not found." };
    }

    if (customerId !== null) {
      const customerResult = await client.query(
        `SELECT id
         FROM customers
         WHERE business_id = $1 AND id = $2`,
        [businessId, customerId],
      );

      if (customerResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return {
          conflict: true,
          reason: "The selected customer does not belong to this business.",
        };
      }
    }

    const previousClassification =
      conversationResult.rows[0].classification_status;

    const updateResult = await client.query(
      `UPDATE business_conversations
       SET classification_status = $3,
           customer_id = CASE WHEN $6 THEN customer_id ELSE $4 END,
           classified_at = NOW(),
           classified_by = $5,
           updated_at = NOW()
       WHERE business_id = $1 AND id = $2
       RETURNING *`,
      [
        businessId,
        conversationId,
        classification,
        customerId,
        userId,
        preserveCustomer,
      ],
    );

    if (classification === "business") {
      // The conversation must be business-classified before insertion:
      // migration 009 enforces that condition on conversation_messages.
      // Only pending messages from the unclassified state are transferred.
      if (previousClassification === "unclassified") {
        await client.query(
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
           SELECT
             business_id,
             conversation_id,
             channel_connection_id,
             'inbound',
             provider_message_id,
             message_type,
             body,
             'received',
             received_at
           FROM pending_conversation_messages
           WHERE business_id = $1 AND conversation_id = $2
           ON CONFLICT (channel_connection_id, provider_message_id)
           WHERE provider_message_id IS NOT NULL
           DO NOTHING`,
          [businessId, conversationId],
        );
      }

      await client.query(
        `DELETE FROM pending_conversation_messages
         WHERE business_id = $1 AND conversation_id = $2`,
        [businessId, conversationId],
      );
    } else {
      // Exclusion permanently removes held content.
      await client.query(
        `DELETE FROM pending_conversation_messages
         WHERE business_id = $1 AND conversation_id = $2`,
        [businessId, conversationId],
      );
    }

    await client.query("COMMIT");

    return {
      conflict: false,
      conversation: updateResult.rows[0],
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
