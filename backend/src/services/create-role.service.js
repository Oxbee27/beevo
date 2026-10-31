import pool from "../config/database.js";

export async function createRole(businessId, data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { name, description, permissions } = data;

    // Verify that all submitted permission codes exist.
    const permissionResult = await client.query(
      `
      SELECT id, code
      FROM permissions
      WHERE code = ANY($1::varchar[])
      `,
      [permissions]
    );

    if (permissionResult.rowCount !== permissions.length) {
      const validCodes = new Set(
        permissionResult.rows.map((permission) => permission.code)
      );

      const invalidPermissions = permissions.filter(
        (code) => !validCodes.has(code)
      );

      const error = new Error(
        `Invalid permissions: ${invalidPermissions.join(", ")}`
      );

      error.status = 400;
      throw error;
    }

    // Create the role for this business.
    const roleResult = await client.query(
      `
      INSERT INTO roles (
        business_id,
        name,
        description
      )
      VALUES ($1, $2, $3)
      RETURNING
        id,
        business_id,
        name,
        description,
        created_at,
        updated_at
      `,
      [
        businessId,
        name,
        description || null,
      ]
    );

    const role = roleResult.rows[0];

    // Assign the selected permissions to the new role.
    if (permissionResult.rows.length > 0) {
      const values = [];
      const placeholders = [];

      permissionResult.rows.forEach((permission, index) => {
        const position = index * 2;

        values.push(role.id, permission.id);

        placeholders.push(
          `($${position + 1}, $${position + 2})`
        );
      });

      await client.query(
        `
        INSERT INTO role_permissions (
          role_id,
          permission_id
        )
        VALUES ${placeholders.join(", ")}
        `,
        values
      );
    }

    await client.query("COMMIT");

    return {
      ...role,
      permissions: permissionResult.rows.map(
        (permission) => permission.code
      ),
    };
  } catch (error) {
    await client.query("ROLLBACK");

    if (error.code === "23505") {
      const conflictError = new Error(
        "A role with this name already exists in your business."
      );

      conflictError.status = 409;
      throw conflictError;
    }

    throw error;
  } finally {
    client.release();
  }
}
