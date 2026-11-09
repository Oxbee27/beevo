import pool from "../config/database.js";

export async function cancelFollowUpMessage(businessId, messageId) {
  const result = await pool.query(
    `
      UPDATE follow_up_messages
      SET status = 'cancelled',
          updated_at = NOW()
      WHERE business_id = $1
        AND id = $2
        AND status = 'pending'
      RETURNING id, follow_up_id, channel, status, scheduled_for, updated_at
    `,
    [businessId, messageId],
  );

  if (result.rowCount > 0) {
    return { message: result.rows[0], conflict: false };
  }

  const existingResult = await pool.query(
    `
      SELECT id, status
      FROM follow_up_messages
      WHERE business_id = $1 AND id = $2
    `,
    [businessId, messageId],
  );

  if (existingResult.rowCount === 0) {
    return { message: null, conflict: false };
  }

  return { message: existingResult.rows[0], conflict: true };
}
