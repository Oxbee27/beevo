import { registerSchema } from "../validators/register.validator.js";
import { registerBusiness } from "../services/register.service.js";
import { generateToken } from "../utils/generate-token.js";

export async function registerController(req, res, next) {
  try {
    const validation = registerSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid registration data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const result = await registerBusiness(validation.data);
    const token = generateToken(result.user);

    return res.status(201).json({
      success: true,
      message: "Business registered successfully.",
      data: {
        business: result.business,
        user: result.user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}