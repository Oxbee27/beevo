import pool from "../config/database.js";

export async function updateStaffStatus(businessId, staffId, isActive) {
  const result = await pool.query(
    `
    UPDATE users
    SET
      is_active = $1,
      updated_at = NOW()
    WHERE id = $2
      AND business_id = $3
      AND role = 'staff'
    RETURNING
      id,
      business_id,
      name,
      email,
      role,
      role_id,
      is_active,
      created_at,
      updated_at
    `,
    [isActive, staffId, businessId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Staff member not found.");
    error.status = 404;
    throw error;
  }

  return result.rows[0];
}
