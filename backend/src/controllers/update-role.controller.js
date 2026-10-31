import { updateRoleSchema } from "../validators/update-role.validator.js";
import { updateRole } from "../services/update-role.service.js";

export async function updateRoleController(req, res, next) {
  try {
    const validation = updateRoleSchema.safeParse(req.body);

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

    const role = await updateRole(
      req.user.businessId,
      req.params.id,
      validation.data
    );

    return res.status(200).json({
      success: true,
      message: "Role updated successfully.",
      data: { role },
    });
  } catch (error) {
    return next(error);
  }
}
