import { getAuthCookie } from "../utils/auth-cookie.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method) || !getAuthCookie(req)) {
    return next();
  }

  const allowedOrigin =
    process.env.CORS_ORIGIN || "http://localhost:5173";

  if (req.headers.origin !== allowedOrigin) {
    return res.status(403).json({
      success: false,
      message: "This request could not be verified. Please refresh and try again.",
    });
  }

  return next();
}
