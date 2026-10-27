import bcrypt from "bcrypt";
import pool from "../config/database.js";

export async function registerBusiness({
  businessName,
  name,
  email,
  password,
  phone,
}) {
  const passwordHash = await bcrypt.hash(password, 12);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const businessResult = await client.query(
      `INSERT INTO businesses (name, email, phone)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, phone, created_at`,
      [businessName, email, phone || null]
    );

    const business = businessResult.rows[0];

    const userResult = await client.query(
      `INSERT INTO users
         (business_id, name, email, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, business_id, name, email, role, created_at`,
      [business.id, name, email, passwordHash, "owner"]
    );

    const user = userResult.rows[0];

    await client.query("COMMIT");

    return { business, user };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      const conflict = new Error(
        "An account with this email already exists."
      );
      conflict.status = 409;
      throw conflict;
    }

    throw error;
  } finally {
    client.release();
  }
}