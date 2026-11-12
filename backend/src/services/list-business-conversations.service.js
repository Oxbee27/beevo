import pool from "../config/database.js";

export async function listBusinessConversations(businessId, filters = {}) {
  const {
    page = 1,
    limit = 20,
    status,
    classification,
    channel,
    assignedTo,
    search,
  } = filters;

  const conditions = ["c.business_id = $1"];
  const values = [businessId];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  if (status) addCondition("c.conversation_status = ?", status);
  if (classification) addCondition("c.classification_status = ?", classification);
  if (channel) addCondition("bc.channel = ?", channel);

  if (assignedTo === "unassigned") {
    conditions.push("c.assigned_to IS NULL");
  } else if (assignedTo !== undefined && assignedTo !== null && assignedTo !== "") {
    addCondition("c.assigned_to = ?", Number(assignedTo));
  }

  if (search) {
    values.push(`%${search}%`);
    const position = values.length;
    conditions.push(`(
      c.contact_identifier ILIKE $${position}
      OR COALESCE(c.contact_display_name, '') ILIKE $${position}
      OR COALESCE(c.subject, '') ILIKE $${position}
    )`);
  }

  const where = conditions.join(" AND ");

  const countResult = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM business_conversations c
     JOIN business_communication_channels bc
       ON bc.id = c.channel_connection_id
      AND bc.business_id = c.business_id
     WHERE ${where}`,
    values,
  );

  const total = countResult.rows[0].total;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `SELECT
       c.id,
       c.business_id,
       c.channel_connection_id,
       bc.channel,
       bc.display_name AS channel_name,
       c.customer_id,
       c.contact_identifier,
       c.contact_display_name,
       c.classification_status,
       c.conversation_status,
       c.assigned_to,
       c.subject,
       c.last_message_at,
       c.classified_at,
       c.created_at,
       c.updated_at,
       latest.body AS last_message_preview,
       latest.direction AS last_message_direction,
       COALESCE(message_counts.message_count, 0)::INTEGER AS message_count
     FROM business_conversations c
     JOIN business_communication_channels bc
       ON bc.id = c.channel_connection_id
      AND bc.business_id = c.business_id
     LEFT JOIN LATERAL (
       SELECT cm.body, cm.direction
       FROM conversation_messages cm
       WHERE cm.business_id = c.business_id
         AND cm.conversation_id = c.id
       ORDER BY cm.created_at DESC, cm.id DESC
       LIMIT 1
     ) latest ON TRUE
     LEFT JOIN LATERAL (
       SELECT COUNT(*) AS message_count
       FROM conversation_messages cm
       WHERE cm.business_id = c.business_id
         AND cm.conversation_id = c.id
     ) message_counts ON TRUE
     WHERE ${where}
     ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, limit, offset],
  );

  return {
    conversations: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getBusinessConversation(businessId, conversationId) {
  const conversationResult = await pool.query(
    `SELECT
       c.*,
       bc.channel,
       bc.display_name AS channel_name
     FROM business_conversations c
     JOIN business_communication_channels bc
       ON bc.id = c.channel_connection_id
      AND bc.business_id = c.business_id
     WHERE c.business_id = $1
       AND c.id = $2`,
    [businessId, conversationId],
  );

  if (conversationResult.rowCount === 0) return null;

  const conversation = conversationResult.rows[0];

  const messagesResult = await pool.query(
    `SELECT
       id,
       direction,
       message_type,
       body,
       delivery_status,
       sent_at,
       received_at,
       delivered_at,
       read_at,
       created_by,
       created_at
     FROM conversation_messages
     WHERE business_id = $1
       AND conversation_id = $2
     ORDER BY created_at ASC, id ASC`,
    [businessId, conversationId],
  );

  return {
    conversation,
    messages: messagesResult.rows,
  };
}
