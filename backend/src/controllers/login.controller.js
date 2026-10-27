import { loginSchema } from "../validators/login.validator.js";
import { loginUser } from "../services/login.service.js";
import { generateToken } from "../utils/generate-token.js";

export async function loginController(req, res, next) {
  try {
    const validation = loginSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid login data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const user = await loginUser(validation.data);
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        user,
        token,
      },
    });
  } catch (error) {
    next(error);
  }
}