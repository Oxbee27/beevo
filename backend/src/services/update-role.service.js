import pool from "../config/database.js";

export async function updateRole(businessId, roleId, data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Confirm that the role belongs to this business.
    const existingRole = await client.query(
      `
      SELECT id
      FROM roles
      WHERE id = $1
        AND business_id = $2
      FOR UPDATE
      `,
      [roleId, businessId]
    );

    if (existingRole.rowCount === 0) {
      const error = new Error("Role not found.");
      error.status = 404;
      throw error;
    }

    // Validate permission codes when permissions are supplied.
    let permissionRows = null;

    if (data.permissions !== undefined) {
      const permissionResult = await client.query(
        `
        SELECT id, code
        FROM permissions
        WHERE code = ANY($1::varchar[])
        `,
        [data.permissions]
      );

      if (permissionResult.rowCount !== data.permissions.length) {
        const validCodes = new Set(
          permissionResult.rows.map((permission) => permission.code)
        );

        const invalidPermissions = data.permissions.filter(
          (code) => !validCodes.has(code)
        );

        const error = new Error(
          `Invalid permissions: ${invalidPermissions.join(", ")}`
        );
        error.status = 400;
        throw error;
      }

      permissionRows = permissionResult.rows;
    }

    // Update role details only when supplied.
    const updateResult = await client.query(
      `
      UPDATE roles
      SET
        name = COALESCE($1, name),
        description = CASE
          WHEN $2::boolean THEN $3::text
          ELSE description
        END,
        updated_at = NOW()
      WHERE id = $4
        AND business_id = $5
      RETURNING
        id,
        business_id,
        name,
        description,
        created_at,
        updated_at
      `,
      [
        data.name ?? null,
        data.description !== undefined,
        data.description ?? null,
        roleId,
        businessId,
      ]
    );

    // Replace permissions only when the permissions field is supplied.
    if (permissionRows !== null) {
      await client.query(
        `
        DELETE FROM role_permissions
        WHERE role_id = $1
        `,
        [roleId]
      );

      if (permissionRows.length > 0) {
        const values = [];
        const placeholders = [];

        permissionRows.forEach((permission, index) => {
          const position = index * 2;

          values.push(roleId, permission.id);
          placeholders.push(
            `($${position + 1}, $${position + 2})`
          );
        });

        await client.query(
          `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES ${placeholders.join(", ")}
          `,
          values
        );
      }
    }

    // Retrieve the final permission list.
    const finalPermissions = await client.query(
      `
      SELECT p.code
      FROM role_permissions rp
      JOIN permissions p
        ON p.id = rp.permission_id
      WHERE rp.role_id = $1
      ORDER BY p.code ASC
      `,
      [roleId]
    );

    await client.query("COMMIT");

    return {
      ...updateResult.rows[0],
      permissions: finalPermissions.rows.map(
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
