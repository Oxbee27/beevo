import pool from "../config/database.js";

export async function listCommunicationsMessages(businessId, filters = {}) {
  const conditions = ["business_id = $1"];
  const values = [businessId];

  function addCondition(sql, value) {
    values.push(value);
    conditions.push(sql.replace("?", `$${values.length}`));
  }

  if (filters.channel) addCondition("channel = ?", filters.channel);
  if (filters.status) addCondition("status = ?", filters.status);
  if (filters.customerId) addCondition("customer_id = ?", filters.customerId);
  if (filters.followUpId) addCondition("follow_up_id = ?", filters.followUpId);
  if (filters.from) addCondition("created_at >= ?::timestamptz", filters.from);
  if (filters.to) addCondition("created_at <= ?::timestamptz", filters.to);

  const where = conditions.join(" AND ");
  const countResult = await pool.query(
    `SELECT COUNT(*)::INTEGER AS total
     FROM follow_up_messages WHERE ${where}`,
    values,
  );

  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const offset = (page - 1) * limit;

  const result = await pool.query(
    `
      SELECT
        id, follow_up_id, enquiry_id, customer_id, channel, recipient,
        subject, body, status, scheduled_for, next_attempt_at,
        attempt_count, max_attempts, provider, provider_message_id,
        last_error, sent_at, delivered_at, created_at, updated_at
      FROM follow_up_messages
      WHERE ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
    `,
    [...values, limit, offset],
  );

  const total = countResult.rows[0].total;

  return {
    messages: result.rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getCommunicationsMessage(businessId, messageId) {
  const messageResult = await pool.query(
    `
      SELECT
        id, follow_up_id, enquiry_id, customer_id, channel, recipient,
        subject, body, template_key, status, scheduled_for, next_attempt_at,
        attempt_count, max_attempts, provider, provider_message_id,
        last_error, sent_at, delivered_at, created_at, updated_at
      FROM follow_up_messages
      WHERE business_id = $1 AND id = $2
    `,
    [businessId, messageId],
  );

  if (messageResult.rowCount === 0) return null;

  const attemptsResult = await pool.query(
    `
      SELECT
        id, attempt_number, provider, status, provider_message_id,
        error_message, attempted_at
      FROM message_delivery_attempts
      WHERE business_id = $1 AND message_id = $2
      ORDER BY attempt_number ASC, id ASC
    `,
    [businessId, messageId],
  );

  return {
    ...messageResult.rows[0],
    attempts: attemptsResult.rows,
  };
}

export async function getCommunicationsOverview(businessId) {
  const result = await pool.query(
    `
      SELECT channel, status, COUNT(*)::INTEGER AS count
      FROM follow_up_messages
      WHERE business_id = $1
      GROUP BY channel, status
      ORDER BY channel ASC, status ASC
    `,
    [businessId],
  );

  const statuses = [
    "pending", "processing", "sent", "delivered",
    "failed", "cancelled", "unknown",
  ];

  const byChannel = Object.fromEntries(
    ["email", "sms", "whatsapp"].map((channel) => [
      channel,
      Object.fromEntries([["total", 0], ...statuses.map((s) => [s, 0])]),
    ]),
  );

  for (const row of result.rows) {
    if (!byChannel[row.channel] || !statuses.includes(row.status)) continue;
    byChannel[row.channel][row.status] = row.count;
    byChannel[row.channel].total += row.count;
  }

  const totals = Object.fromEntries(
    ["total", ...statuses].map((key) => [
      key,
      Object.values(byChannel).reduce((sum, channel) => sum + channel[key], 0),
    ]),
  );

  const completed = totals.delivered + totals.failed;

  return {
    totals,
    byChannel,
    deliveryRate: completed
      ? Number(((totals.delivered / completed) * 100).toFixed(2))
      : null,
  };
}
