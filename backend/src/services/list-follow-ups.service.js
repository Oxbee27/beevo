import pool from "../config/database.js";

export async function listFollowUps(businessId) {
  const result = await pool.query(
    `SELECT
       f.*,
       e.subject AS enquiry_subject,
       c.name AS customer_name,
       u.name AS assigned_to_name
     FROM follow_ups f
     JOIN enquiries e ON e.id = f.enquiry_id
     JOIN customers c ON c.id = e.customer_id
     LEFT JOIN users u ON u.id = f.assigned_to
     WHERE f.business_id = $1
     ORDER BY
       CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END,
       f.due_at ASC,
       f.id ASC`,
    [businessId]
  );

  return result.rows;
}
