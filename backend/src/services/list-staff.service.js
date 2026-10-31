import pool from "../config/database.js";

export async function listStaff(businessId) {
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
    WHERE u.business_id = $1
      AND u.role = 'staff'
    ORDER BY u.created_at DESC
    `,
    [businessId]
  );

  return result.rows;
}
