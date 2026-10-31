import pool from "../config/database.js";

export function requirePermission(permissionCode) {
  return async function (req, res, next) {
    try {
      const result = await pool.query(
        `
        SELECT
          u.role,
          EXISTS (
            SELECT 1
            FROM role_permissions rp
            JOIN permissions p
              ON p.id = rp.permission_id
            WHERE rp.role_id = u.role_id
              AND p.code = $3
          ) AS has_permission
        FROM users u
        WHERE u.id = $1
          AND u.business_id = $2
        `,
        [
          req.user.id,
          req.user.businessId,
          permissionCode,
        ]
      );

      // The account may have been deleted or moved.
      if (result.rowCount === 0) {
        return res.status(401).json({
          success: false,
          message: "Your account is no longer available.",
        });
      }

      const user = result.rows[0];

      // Always use the current database role, not the JWT role.
      req.user.role = user.role;

      // Owners automatically have full access.
      if (user.role === "owner") {
        return next();
      }

      // Staff must have the requested permission.
      if (!user.has_permission) {
        return res.status(403).json({
          success: false,
          message: "You do not have permission to perform this action.",
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}
