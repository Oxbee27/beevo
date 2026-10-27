
import pool from "../config/database.js";

export async function deleteEnquiry(businessId, enquiryId) {
  const result = await pool.query(
    `DELETE FROM enquiries
     WHERE business_id = $1 AND id = $2
     RETURNING id`,
    [businessId, enquiryId]
  );

  return result.rowCount > 0;
}
