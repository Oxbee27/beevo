import pool from "../config/database.js";

export async function listRoles(businessId) {
  const result = await pool.query(
    `
    SELECT
      r.id,
      r.business_id,
      r.name,
      r.description,
      r.created_at,
      r.updated_at,
      COALESCE(
        JSON_AGG(p.code ORDER BY p.code)
          FILTER (WHERE p.code IS NOT NULL),
        '[]'::json
      ) AS permissions,
      COUNT(DISTINCT u.id)::int AS assigned_staff_count
    FROM roles r
    LEFT JOIN role_permissions rp
      ON rp.role_id = r.id
    LEFT JOIN permissions p
      ON p.id = rp.permission_id
    LEFT JOIN users u
      ON u.role_id = r.id
      AND u.business_id = r.business_id
      AND u.role = 'staff'
    WHERE r.business_id = $1
    GROUP BY r.id
    ORDER BY r.created_at DESC
    `,
    [businessId]
  );

  return result.rows;
}
