import { updateStaffSchema } from "../validators/update-staff.validator.js";
import { updateStaff } from "../services/update-staff.service.js";

export async function updateStaffController(req, res, next) {
  try {
    const validation = updateStaffSchema.safeParse(req.body);

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

    const staff = await updateStaff(
      req.user.businessId,
      req.params.id,
      validation.data
    );

    return res.status(200).json({
      success: true,
      message: "Staff member updated successfully.",
      data: { staff },
    });
  } catch (error) {
    return next(error);
  }
}
