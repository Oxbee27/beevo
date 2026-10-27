
import pool from "../config/database.js";

export async function listCustomers(businessId) {
  const result = await pool.query(
    `SELECT
       id, business_id, name, email, phone, notes,
       created_at, updated_at
     FROM customers
     WHERE business_id = $1
     ORDER BY created_at DESC, id DESC`,
    [businessId]
  );

  return result.rows;
}
