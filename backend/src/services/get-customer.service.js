
import pool from "../config/database.js";

export async function getCustomer(businessId, customerId) {
  const result = await pool.query(
    `SELECT
       id, business_id, name, email, phone, notes,
       created_at, updated_at
     FROM customers
     WHERE business_id = $1 AND id = $2`,
    [businessId, customerId]
  );

  return result.rows[0] || null;
}
