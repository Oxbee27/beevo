import pool from "../config/database.js";

export async function requireOwner(req, res, next) {
  try {
    const result = await pool.query(
      `
      SELECT role
      FROM users
      WHERE id = $1
        AND business_id = $2
      `,
      [req.user.id, req.user.businessId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({
        success: false,
        message: "Your account is no longer available.",
      });
    }

    if (result.rows[0].role !== "owner") {
      return res.status(403).json({
        success: false,
        message: "Only business owners can perform this action.",
      });
    }

    req.user.role = result.rows[0].role;

    return next();
  } catch (error) {
    return next(error);
  }
}
