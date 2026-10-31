import pool from "../config/database.js";

export async function listPermissions() {
  const result = await pool.query(
    `
    SELECT
      id,
      code,
      description
    FROM permissions
    ORDER BY code ASC
    `
  );

  return result.rows;
}
