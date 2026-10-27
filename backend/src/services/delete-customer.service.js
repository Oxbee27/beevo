
import pool from "../config/database.js";

export async function deleteCustomer(businessId, customerId) {
  const result = await pool.query(
    `DELETE FROM customers
     WHERE business_id = $1 AND id = $2
     RETURNING id`,
    [businessId, customerId]
  );

  return result.rowCount > 0;
}
