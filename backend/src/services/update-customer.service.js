
import pool from "../config/database.js";

export async function updateCustomer(
  businessId,
  customerId,
  data
) {
  const fields = Object.keys(data);
  const values = fields.map((field) =>
    field === "email" ? data[field] || null : data[field]
  );

  const assignments = fields.map(
    (field, index) => `${field} = $${index + 3}`
  );

  const result = await pool.query(
    `UPDATE customers
     SET ${assignments.join(", ")},
         updated_at = CURRENT_TIMESTAMP
     WHERE business_id = $1 AND id = $2
     RETURNING
       id, business_id, name, email, phone, notes,
       created_at, updated_at`,
    [businessId, customerId, ...values]
  );

  return result.rows[0] || null;
}
