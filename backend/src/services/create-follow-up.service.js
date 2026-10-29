import pool from "../config/database.js";

export async function createFollowUp(businessId, data) {
  const {
    enquiryId,
    assignedTo,
    note,
    dueAt,
    status = "pending",
  } = data;

  const enquiry = await pool.query(
    `SELECT id FROM enquiries
     WHERE id = $1 AND business_id = $2`,
    [enquiryId, businessId]
  );

  if (enquiry.rowCount === 0) {
    const error = new Error("Enquiry not found in your business.");
    error.status = 404;
    throw error;
  }

  if (assignedTo !== undefined) {
    const assignee = await pool.query(
      `SELECT id FROM users
       WHERE id = $1 AND business_id = $2`,
      [assignedTo, businessId]
    );

    if (assignee.rowCount === 0) {
      const error = new Error("Assigned user not found in your business.");
      error.status = 404;
      throw error;
    }
  }

  const result = await pool.query(
    `INSERT INTO follow_ups (
       business_id, enquiry_id, assigned_to, note, due_at, status,
       completed_at
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       CASE WHEN $6::varchar = 'completed' THEN CURRENT_TIMESTAMP ELSE NULL END
     )
     RETURNING *`,
    [
      businessId,
      enquiryId,
      assignedTo ?? null,
      note,
      dueAt,
      status,
    ]
  );

  return result.rows[0];
}
