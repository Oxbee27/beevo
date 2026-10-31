import { changePasswordSchema } from "../validators/change-password.validator.js";
import { changePassword } from "../services/change-password.service.js";

export async function changePasswordController(req, res, next) {
  try {
    const validation = changePasswordSchema.safeParse(req.body);

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

    await changePassword(
      req.user.id,
      req.user.businessId,
      validation.data
    );

    return res.status(200).json({
      success: true,
      message: "Your password has been changed. Please log in again.",
    });
  } catch (error) {
    return next(error);
  }
}
