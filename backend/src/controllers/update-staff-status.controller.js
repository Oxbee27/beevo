import { updateStaffStatusSchema } from "../validators/update-staff-status.validator.js";
import { updateStaffStatus } from "../services/update-staff-status.service.js";

export async function updateStaffStatusController(req, res, next) {
  try {
    const validation = updateStaffStatusSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff status.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const staff = await updateStaffStatus(
      req.user.businessId,
      req.params.id,
      validation.data.isActive
    );

    return res.status(200).json({
      success: true,
      message: staff.is_active
        ? "Staff member activated successfully."
        : "Staff member deactivated successfully.",
      data: { staff },
    });
  } catch (error) {
    return next(error);
  }
}
