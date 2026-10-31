import jwt from "jsonwebtoken";
import pool from "../config/database.js";

export async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication token required.",
    });
  }

  const token = authorization.slice(7);

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ["HS256"],
    });

    if (
      typeof payload === "string" ||
      !payload.sub ||
      !payload.businessId ||
      !payload.role ||
      !Number.isInteger(payload.tokenVersion ?? 0) ||
      (payload.tokenVersion ?? 0) < 0
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        business_id,
        role,
        is_active,
        token_version
      FROM users
      WHERE id = $1
        AND business_id = $2
      `,
      [payload.sub, payload.businessId]
    );

    if (
      result.rowCount === 0 ||
      !result.rows[0].is_active
    ) {
      return res.status(401).json({
        success: false,
        message: "Your account is inactive or no longer available.",
      });
    }

    const user = result.rows[0];

    if (
      Number(payload.tokenVersion ?? 0) !==
      Number(user.token_version)
    ) {
      return res.status(401).json({
        success: false,
        message: "Your session has expired. Please log in again.",
      });
    }

    req.user = {
      id: String(user.id),
      businessId: String(user.business_id),
      role: user.role,
    };

    return next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    return next(error);
  }
}
