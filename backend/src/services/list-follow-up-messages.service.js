import pool from "../config/database.js";

export async function listFollowUpMessages(businessId, followUpId) {
  const followUpResult = await pool.query(
    `
      SELECT id
      FROM follow_ups
      WHERE business_id = $1 AND id = $2
    `,
    [businessId, followUpId],
  );

  if (followUpResult.rowCount === 0) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        id,
        follow_up_id,
        channel,
        recipient,
        subject,
        body,
        status,
        scheduled_for,
        attempt_count,
        max_attempts,
        provider,
        provider_message_id,
        last_error,
        sent_at,
        delivered_at,
        created_at,
        updated_at
      FROM follow_up_messages
      WHERE business_id = $1
        AND follow_up_id = $2
      ORDER BY scheduled_for DESC, id DESC
    `,
    [businessId, followUpId],
  );

  return result.rows;
}
