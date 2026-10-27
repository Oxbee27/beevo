
import pool from "../config/database.js";

export async function updateEnquiry(
  businessId,
  enquiryId,
  data
) {
  const { customerId, ...fieldsToUpdate } = data;

  if (customerId !== undefined) {
    const customerResult = await pool.query(
      `SELECT id
       FROM customers
       WHERE id = $1 AND business_id = $2`,
      [customerId, businessId]
    );

    if (customerResult.rowCount === 0) {
      const error = new Error(
        "Customer not found in your business."
      );
      error.status = 404;
      throw error;
    }

    fieldsToUpdate.customer_id = customerId;
  }

  const columnNames = {
    subject: "subject",
    description: "description",
    source: "source",
    status: "status",
    estimatedValue: "estimated_value",
    currency: "currency",
    customer_id: "customer_id",
  };

  const entries = Object.entries(fieldsToUpdate);

  if (entries.length === 0) {
    const error = new Error(
      "Provide at least one field to update."
    );
    error.status = 400;
    throw error;
  }

  const values = entries.map(([key, value]) => value);

  const assignments = entries.map(([key], index) => {
    return `${columnNames[key]} = $${index + 3}`;
  });

  const result = await pool.query(
    `UPDATE enquiries
     SET ${assignments.join(", ")},
         updated_at = CURRENT_TIMESTAMP
     WHERE business_id = $1 AND id = $2
     RETURNING *`,
    [businessId, enquiryId, ...values]
  );

  return result.rows[0] || null;
}
