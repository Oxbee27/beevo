import { forgotPasswordSchema } from "../validators/forgot-password.validator.js";
import { forgotPassword } from "../services/forgot-password.service.js";

export async function forgotPasswordController(req, res, next) {
  try {
    const validation = forgotPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    await forgotPassword(validation.data.email);

    return res.status(200).json({
      success: true,
      message: "If an account exists with that email, password reset instructions will be sent shortly.",
    });
  } catch (error) {
    return next(error);
  }
}
