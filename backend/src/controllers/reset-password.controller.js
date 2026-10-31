import { resetPasswordSchema } from "../validators/reset-password.validator.js";
import { resetPassword } from "../services/reset-password.service.js";

export async function resetPasswordController(req, res, next) {
  try {
    const validation = resetPasswordSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Please check the information you entered.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    await resetPassword(
      validation.data.token,
      validation.data.newPassword
    );

    return res.status(200).json({
      success: true,
      message: "Your password has been reset successfully. You can now log in with your new password.",
    });
  } catch (error) {
    return next(error);
  }
}
