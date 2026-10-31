import { createRoleSchema } from "../validators/create-role.validator.js";
import { createRole } from "../services/create-role.service.js";

export async function createRoleController(req, res, next) {
  try {
    const validation = createRoleSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid role data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const role = await createRole(
      req.user.businessId,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Role created successfully.",
      data: { role },
    });
  } catch (error) {
    return next(error);
  }
}
