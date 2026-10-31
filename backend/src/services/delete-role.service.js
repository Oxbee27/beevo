import pool from "../config/database.js";

export async function deleteRole(businessId, roleId) {
  try {
    const result = await pool.query(
      `
      DELETE FROM roles
      WHERE id = $1
        AND business_id = $2
      RETURNING
        id,
        business_id,
        name,
        description
      `,
      [roleId, businessId]
    );

    if (result.rowCount === 0) {
      const error = new Error("Role not found.");
      error.status = 404;
      throw error;
    }

    return result.rows[0];
  } catch (error) {
    // Prevent deletion when staff members are assigned to this role.
    if (
      error.code === "23503" &&
      error.constraint === "users_role_business_fk"
    ) {
      const conflictError = new Error(
        "This role cannot be deleted because staff members are assigned to it."
      );

      conflictError.status = 409;
      throw conflictError;
    }

    throw error;
  }
}
