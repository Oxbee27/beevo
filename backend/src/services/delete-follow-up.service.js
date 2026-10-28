import pool from "../config/database.js";

export async function deleteFollowUp(businessId, followUpId) {
  const result = await pool.query(
    `DELETE FROM follow_ups
     WHERE business_id = $1 AND id = $2
     RETURNING id`,
    [businessId, followUpId]
  );

  return result.rowCount > 0;
}
