import bcrypt from "bcrypt";
import pool from "../config/database.js";

export async function changePassword(userId, businessId, data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, password_hash
       FROM users
       WHERE id = $1
         AND business_id = $2
         AND is_active = TRUE
       FOR UPDATE`,
      [userId, businessId]
    );

    if (result.rowCount === 0) {
      const error = new Error("Your account is unavailable.");
      error.status = 401;
      throw error;
    }

    const user = result.rows[0];

    const matches = await bcrypt.compare(
      data.currentPassword,
      user.password_hash
    );

    if (!matches) {
      const error = new Error("Your current password is incorrect.");
      error.status = 400;
      throw error;
    }

    const passwordHash = await bcrypt.hash(data.newPassword, 12);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           token_version = token_version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, userId]
    );

    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [userId]
    );

    await client.query("COMMIT");

    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
