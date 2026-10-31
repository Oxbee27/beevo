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
    const error = new Error("Invalid email or password.");
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.password_hash
  );

  if (!passwordMatches || !user.is_active) {
    const error = new Error("Invalid email or password.");
    error.status = 401;
    throw error;
  }

  const {
    password_hash,
    is_active,
    ...safeUser
  } = user;

  return safeUser;
}
