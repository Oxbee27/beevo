
import pool from "../config/database.js";

export async function createEnquiry(businessId, userId, data) {
  const {
    customerId,
    subject,
    description,
    source,
    status,
    estimatedValue,
    currency,
  } = data;

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

  const result = await pool.query(
    `INSERT INTO enquiries (
       business_id,
       customer_id,
       created_by,
       subject,
       description,
       source,
       status,
       estimated_value,
       currency
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      businessId,
      customerId,
      userId,
      subject,
      description || null,
      source || null,
      status || "new",
      estimatedValue ?? null,
      currency || "NGN",
    ]
  );

  return result.rows[0];
}
