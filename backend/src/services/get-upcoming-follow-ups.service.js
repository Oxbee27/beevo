import pool from "../config/database.js";

export async function getUpcomingFollowUps(businessId) {
  const result = await pool.query(
    `SELECT
       f.id,
       f.enquiry_id AS "enquiryId",
       f.note,
       f.due_at AS "dueAt",
       f.status,
       f.assigned_to AS "assignedTo",
       u.name AS "assignedToName",
       e.subject AS "enquirySubject",
       c.id AS "customerId",
       c.name AS "customerName"
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
       AND f.status = 'pending'
       AND f.due_at >= CURRENT_TIMESTAMP
       AND f.due_at < CURRENT_TIMESTAMP + INTERVAL '7 days'
     ORDER BY f.due_at ASC`,
    [businessId]
  );

  return result.rows;
}
