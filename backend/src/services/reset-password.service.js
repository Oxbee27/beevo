import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import pool from "../config/database.js";

function invalidTokenError() {
  const error = new Error("This password reset link is invalid or has expired.");
  error.status = 400;
  return error;
}

export async function resetPassword(token, newPassword) {
  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const tokenResult = await client.query(
      `SELECT id, user_id
       FROM password_reset_tokens
       WHERE token_hash = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [tokenHash]
    );

    if (tokenResult.rowCount === 0) {
      throw invalidTokenError();
    }

    const resetToken = tokenResult.rows[0];

    // Lock the user to serialize competing reset requests.
    const userResult = await client.query(
      `SELECT id
       FROM users
       WHERE id = $1
         AND is_active = TRUE
       FOR UPDATE`,
      [resetToken.user_id]
    );

    if (userResult.rowCount === 0) {
      throw invalidTokenError();
    }

    // Recheck after acquiring the user lock. Another reset may
    // have consumed this token while this transaction was waiting.
    const recheck = await client.query(
      `SELECT id
       FROM password_reset_tokens
       WHERE id = $1
         AND used_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [resetToken.id]
    );

    if (recheck.rowCount === 0) {
      throw invalidTokenError();
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await client.query(
      `UPDATE users
       SET password_hash = $1,
           token_version = token_version + 1,
           updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, resetToken.user_id]
    );

    // Consume this token and every other outstanding reset token.
    await client.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE user_id = $1
         AND used_at IS NULL`,
      [resetToken.user_id]
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
