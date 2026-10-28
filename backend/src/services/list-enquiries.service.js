
import pool from "../config/database.js";

export async function listEnquiries(businessId) {
  const result = await pool.query(
    `SELECT
       e.*,
       c.name AS customer_name
     FROM enquiries e
     JOIN customers c
       ON c.id = e.customer_id
      AND c.business_id = e.business_id
     WHERE e.business_id = $1
     ORDER BY e.created_at DESC, e.id DESC`,
    [businessId]
  );

  return result.rows;
}
