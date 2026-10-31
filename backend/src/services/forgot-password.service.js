import { randomBytes, createHash } from "node:crypto";
import pool from "../config/database.js";
import { sendPasswordResetEmail } from "../utils/send-password-reset-email.js";

export async function forgotPassword(email) {
  const result = await pool.query(
    `SELECT id
     FROM users
     WHERE email = $1
       AND is_active = TRUE`,
    [email]
  );

  // Do not reveal whether an account exists.
  if (result.rowCount === 0) {
    return;
  }

  const userId = result.rows[0].id;
  const rawToken = randomBytes(32).toString("hex");

  const tokenHash = createHash("sha256")
    .update(rawToken)
    .digest("hex");

  await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE user_id = $1
       AND used_at IS NULL`,
    [userId]
  );

  await pool.query(
    `INSERT INTO password_reset_tokens
       (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '30 minutes')`,
    [userId, tokenHash]
  );

  try {
    await sendPasswordResetEmail(email, rawToken);
  } catch (error) {
    await pool.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token_hash = $1
         AND used_at IS NULL`,
      [tokenHash]
    );

    // Do not log the reset token or email contents.
    console.error("Beevo password-reset email delivery failed:", error.message);
  }
}
