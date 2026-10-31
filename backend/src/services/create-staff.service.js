import bcrypt from "bcrypt";
import pool from "../config/database.js";

export async function createStaff(businessId, data) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // A staff member can only receive a role from this business.
    if (data.roleId !== undefined && data.roleId !== null) {
      const roleResult = await client.query(
        `
        SELECT id
        FROM roles
        WHERE id = $1
          AND business_id = $2
        `,
        [data.roleId, businessId]
      );

      if (roleResult.rowCount === 0) {
        const error = new Error("Role not found in your business.");
        error.status = 404;
        throw error;
      }
    }

    const result = await client.query(
      `
      INSERT INTO users (
        business_id,
        name,
        email,
        password_hash,
        role,
        role_id
      )
      VALUES ($1, $2, $3, $4, 'staff', $5)
      RETURNING
        id,
        business_id,
        name,
        email,
        role,
        role_id,
        is_active,
        created_at,
        updated_at
      `,
      [
        businessId,
        data.name,
        data.email,
        passwordHash,
        data.roleId ?? null,
      ]
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return result.rows[0];
  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

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
