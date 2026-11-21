import pool from "../config/database.js";

export async function listPendingConversations(
  businessId,
  { page = 1, limit = 20 } = {},
) {
  const offset = (page - 1) * limit;

  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT
         c.id,
         c.channel_connection_id,
         c.contact_identifier,
         c.contact_display_name,
         c.conversation_status,
         c.created_at,
         ch.channel,
         pending.pending_count,
         pending.latest_received_at,
         pending.latest_message_preview
       FROM business_conversations c
       JOIN business_communication_channels ch
         ON ch.business_id = c.business_id
        AND ch.id = c.channel_connection_id
       JOIN LATERAL (
         SELECT
           COUNT(*)::INTEGER AS pending_count,
           MAX(p.received_at) AS latest_received_at,
           (
             SELECT p2.body
             FROM pending_conversation_messages p2
             WHERE p2.business_id = c.business_id
               AND p2.conversation_id = c.id
             ORDER BY p2.received_at DESC, p2.id DESC
             LIMIT 1
           ) AS latest_message_preview
         FROM pending_conversation_messages p
         WHERE p.business_id = c.business_id
           AND p.conversation_id = c.id
       ) pending ON pending.pending_count > 0
       WHERE c.business_id = $1
         AND c.classification_status = 'unclassified'
       ORDER BY pending.latest_received_at DESC, c.id DESC
       LIMIT $2 OFFSET $3`,
      [businessId, limit, offset],
    ),
    pool.query(
      `SELECT COUNT(*)::INTEGER AS total
       FROM business_conversations c
       WHERE c.business_id = $1
         AND c.classification_status = 'unclassified'
         AND EXISTS (
           SELECT 1
           FROM pending_conversation_messages p
           WHERE p.business_id = c.business_id
             AND p.conversation_id = c.id
         )`,
      [businessId],
    ),
  ]);

  const total = countResult.rows[0]?.total ?? 0;

  return {
    conversations: itemsResult.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getPendingConversation(businessId, conversationId) {
  const conversationResult = await pool.query(
    `SELECT
       c.id,
       c.channel_connection_id,
       c.contact_identifier,
       c.contact_display_name,
       c.conversation_status,
       c.created_at,
       ch.channel
     FROM business_conversations c
     JOIN business_communication_channels ch
       ON ch.business_id = c.business_id
      AND ch.id = c.channel_connection_id
     WHERE c.business_id = $1
       AND c.id = $2
       AND c.classification_status = 'unclassified'
       AND EXISTS (
         SELECT 1
         FROM pending_conversation_messages p
         WHERE p.business_id = c.business_id
           AND p.conversation_id = c.id
       )`,
    [businessId, conversationId],
  );

  if (conversationResult.rowCount === 0) return null;

  const messagesResult = await pool.query(
    `SELECT id, message_type, body, received_at
     FROM pending_conversation_messages
     WHERE business_id = $1 AND conversation_id = $2
     ORDER BY received_at ASC, id ASC`,
    [businessId, conversationId],
  );

  return {
    conversation: conversationResult.rows[0],
    messages: messagesResult.rows,
  };
}
