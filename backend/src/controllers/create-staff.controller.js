import { createStaffSchema } from "../validators/create-staff.validator.js";
import { createStaff } from "../services/create-staff.service.js";

export async function createStaffController(req, res, next) {
  try {
    const validation = createStaffSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid staff data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const staff = await createStaff(
      req.user.businessId,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Staff member created successfully.",
      data: { staff },
    });
  } catch (error) {
    return next(error);
  }
}
