import pool from "../config/database.js";

export async function getStaff(businessId, staffId) {
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.business_id,
      u.name,
      u.email,
      u.role,
      u.role_id,
      r.name AS role_name,
      u.is_active,
      u.created_at,
      u.updated_at
    FROM users u
    LEFT JOIN roles r
      ON r.id = u.role_id
      AND r.business_id = u.business_id
    WHERE u.id = $1
      AND u.business_id = $2
      AND u.role = 'staff'
    `,
    [staffId, businessId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Staff member not found.");
    error.status = 404;
    throw error;
  }

  return result.rows[0];
}
