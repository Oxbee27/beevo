import pool from "../config/database.js";

export async function updateFollowUp(businessId, followUpId, data) {
  const {
    enquiryId,
    assignedTo,
    note,
    dueAt,
    status,
  } = data;

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const currentResult = await client.query(
      `SELECT id, status FROM follow_ups
       WHERE id = $1 AND business_id = $2
       FOR UPDATE`,
      [followUpId, businessId]
    );

    if (currentResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const current = currentResult.rows[0];

    if (enquiryId !== undefined) {
      const enquiry = await client.query(
        `SELECT id FROM enquiries
         WHERE id = $1 AND business_id = $2`,
        [enquiryId, businessId]
      );

      if (enquiry.rowCount === 0) {
        const error = new Error("Enquiry not found in your business.");
        error.status = 404;
        throw error;
      }
    }

    if (assignedTo !== undefined && assignedTo !== null) {
      const assignee = await client.query(
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

    const fields = [];
    const values = [businessId, followUpId];
    const addField = (column, value) => {
      values.push(value);
      fields.push(`${column} = $${values.length}`);
    };

    if (enquiryId !== undefined) addField("enquiry_id", enquiryId);
    if (assignedTo !== undefined) addField("assigned_to", assignedTo);
    if (note !== undefined) addField("note", note);
    if (dueAt !== undefined) addField("due_at", dueAt);

    if (status !== undefined) {
      addField("status", status);

      if (status === "completed") {
        fields.push("completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)");
      } else {
        fields.push("completed_at = NULL");
      }
    }

    if (fields.length === 0) {
      const error = new Error("Provide at least one field to update.");
      error.status = 400;
      throw error;
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");

    const result = await client.query(
      `UPDATE follow_ups
       SET ${fields.join(", ")}
       WHERE business_id = $1 AND id = $2
       RETURNING *`,
      values
    );

    await client.query("COMMIT");
    return result.rows[0] || null;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
