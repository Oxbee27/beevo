
import pool from "../config/database.js";

export async function createCustomer(businessId, data) {
  const { name, email, phone, notes } = data;

  const result = await pool.query(
    `INSERT INTO customers
       (business_id, name, email, phone, notes)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING
       id, business_id, name, email, phone, notes,
       created_at, updated_at`,
    [
      businessId,
      name,
      email || null,
      phone || null,
      notes || null,
    ]
  );

  return result.rows[0];
}
