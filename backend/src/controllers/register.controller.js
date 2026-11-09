import { registerSchema } from "../validators/register.validator.js";
import { registerBusiness } from "../services/register.service.js";

export async function registerController(req, res, next) {
  try {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "We couldn't create your account. Please check your details and try again.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await registerBusiness(validation.data);

    return res.status(201).json({
      success: true,
      message: "Business registered successfully.",
      data: {
        business: result.business,
        user: result.user,
      },
    });
  } catch (error) {
    next(error);
  }
}