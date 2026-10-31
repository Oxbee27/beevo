import pool from "../config/database.js";

export async function updateStaff(businessId, staffId, data) {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    const existing = await client.query(
      `
      SELECT id
      FROM users
      WHERE id = $1
        AND business_id = $2
        AND role = 'staff'
      FOR UPDATE
      `,
      [staffId, businessId]
    );

    if (existing.rowCount === 0) {
      const error = new Error("Staff member not found.");
      error.status = 404;
      throw error;
    }

    // Verify the new role belongs to this business.
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

    await client.query(
      `
      UPDATE users
      SET
        name = CASE
          WHEN $1::boolean THEN $2
          ELSE name
        END,
        email = CASE
          WHEN $3::boolean THEN $4
          ELSE email
        END,
        role_id = CASE
          WHEN $5::boolean THEN $6::bigint
          ELSE role_id
        END,
        updated_at = NOW()
      WHERE id = $7
        AND business_id = $8
        AND role = 'staff'
      `,
      [
        data.name !== undefined,
        data.name ?? null,
        data.email !== undefined,
        data.email ?? null,
        data.roleId !== undefined,
        data.roleId ?? null,
        staffId,
        businessId,
      ]
    );

    const result = await client.query(
      `
      SELECT
        u.id,
        u.business_id,
        u.name,
        u.email,
        u.role,
        u.role_id,
        r.name AS role_name,
        u.is_active,
        u.created_at,
        u.updated_at
      FROM users u
      LEFT JOIN roles r
        ON r.id = u.role_id
        AND r.business_id = u.business_id
      WHERE u.id = $1
        AND u.business_id = $2
        AND u.role = 'staff'
      `,
      [staffId, businessId]
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
