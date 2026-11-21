import { googleLoginUser } from "../services/google-login.service.js";
import { generateToken } from "../utils/generate-token.js";
import { setAuthCookie } from "../utils/auth-cookie.js";

export async function googleLoginController(req, res, next) {
  try {
    const credential = req.body?.credential;

    if (
      typeof credential !== "string" ||
      !credential.trim() ||
      credential.length > 10000
    ) {
      return res.status(400).json({
        success: false,
        message: "Please complete Google sign-in and try again.",
      });
    }

    const user = await googleLoginUser(credential.trim());
    const token = generateToken(user);

    setAuthCookie(res, token);

    const { token_version, is_active, ...publicUser } = user;

    return res.status(200).json({
      success: true,
      message: "Google sign-in successful.",
      data: { user: publicUser },
    });
  } catch (error) {
    if (error.publicMessage) {
      return res.status(error.status || 401).json({
        success: false,
        message: error.publicMessage,
      });
    }

    return next(error);
  }
}
