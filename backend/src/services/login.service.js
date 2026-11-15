import bcrypt from "bcrypt";
import pool from "../config/database.js";

export async function loginUser({ email, password }) {
  const result = await pool.query(
    `
    SELECT
      u.id,
      u.business_id,
      u.name,
      u.email,
      u.password_hash,
      u.role,
      u.is_active,
      u.token_version,
      b.name AS business_name
    FROM users u
    JOIN businesses b
      ON b.id = u.business_id
    WHERE u.email = $1
    `,
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    const error = new Error("Email address not found.");
    error.status = 401;
    error.publicMessage =
      "The email address you entered is incorrect.";
    error.field = "email";
    throw error;
  }

  if (!user.is_active) {
    const error = new Error("User account is inactive.");
    error.status = 403;
    error.publicMessage =
      "This account is currently inactive. Please contact your business administrator.";
    throw error;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches) {
    const error = new Error("Incorrect password.");
    error.status = 401;
    error.publicMessage =
      "The password you entered is incorrect.";
    error.field = "password";
    throw error;
  }

  const {
    password_hash,
    is_active,
    ...safeUser
  } = user;

  return safeUser;
}
