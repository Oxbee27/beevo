import pool from "../config/database.js";

export async function revokeUserSessions(userId, businessId) {
  const result = await pool.query(
    `UPDATE users
     SET token_version = token_version + 1,
         updated_at = NOW()
     WHERE id = $1
       AND business_id = $2
       AND is_active = TRUE
     RETURNING id`,
    [userId, businessId]
  );

  return result.rowCount > 0;
}
