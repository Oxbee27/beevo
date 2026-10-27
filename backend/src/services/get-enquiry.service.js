
import pool from "../config/database.js";

export async function getEnquiry(businessId, enquiryId) {
  const result = await pool.query(
    `SELECT
       e.*,
       c.name AS customer_name
     FROM enquiries e
     JOIN customers c ON c.id = e.customer_id
     WHERE e.business_id = $1 AND e.id = $2`,
    [businessId, enquiryId]
  );

  return result.rows[0] || null;
}
