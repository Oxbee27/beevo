import { revokeUserSessions } from "../services/logout.service.js";
import { clearAuthCookie } from "../utils/auth-cookie.js";

export async function logoutController(req, res, next) {
  try {
    const revoked = await revokeUserSessions(
      req.user.id,
      req.user.businessId
    );

    if (!revoked) {
      return res.status(401).json({
        success: false,
        message: "Your session is no longer valid. Please log in again.",
      });
    }

    clearAuthCookie(res);

    return res.status(200).json({
      success: true,
      message: "You have been logged out successfully.",
    });
  } catch (error) {
    return next(error);
  }
}
