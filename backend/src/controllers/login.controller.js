import { loginSchema } from "../validators/login.validator.js";
import { loginUser } from "../services/login.service.js";
import { generateToken } from "../utils/generate-token.js";
import { setAuthCookie } from "../utils/auth-cookie.js";

export async function loginController(req, res, next) {
  try {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || !String(email).trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter your email address.",
        errors: { email: "Email address is required." },
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your password.",
        errors: { password: "Password is required." },
      });
    }

    const validation = loginSchema.safeParse({ email, password });

    if (!validation.success) {
      const emailIssue = validation.error.issues.find(
        issue => issue.path[0] === "email"
      );

      if (emailIssue) {
        return res.status(400).json({
          success: false,
          message: "The email address you entered is invalid.",
          errors: { email: "Please enter a valid email address." },
        });
      }

      return res.status(400).json({
        success: false,
        message: "The password you entered is invalid.",
        errors: { password: "Please check your password." },
      });
    }

    const user = await loginUser(validation.data);
    const token = generateToken(user);
    setAuthCookie(res, token);

    const { token_version, ...publicUser } = user;

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: { user: publicUser },
    });
  } catch (error) {
    if (error.publicMessage) {
      const field = error.field;

      return res.status(error.status || 401).json({
        success: false,
        message: error.publicMessage,
        ...(field
          ? {
              errors: {
                [field]:
                  field === "email"
                    ? "Please check your email address and try again."
                    : "Please check your password and try again."
              }
            }
          : {})
      });
    }

    return next(error);
  }
}
