import pool from "../config/database.js";

export async function getFollowUp(businessId, followUpId) {
  const result = await pool.query(
    `SELECT
       f.*,
       e.subject AS enquiry_subject,
       c.name AS customer_name,
       u.name AS assigned_to_name
     FROM follow_ups f
     JOIN enquiries e
       ON e.id = f.enquiry_id
      AND e.business_id = f.business_id
     JOIN customers c
       ON c.id = e.customer_id
      AND c.business_id = e.business_id
     LEFT JOIN users u
       ON u.id = f.assigned_to
      AND u.business_id = f.business_id
     WHERE f.business_id = $1
       AND f.id = $2`,
    [businessId, followUpId]
  );

  return result.rows[0] || null;
}
