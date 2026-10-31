import { listStaff } from "../services/list-staff.service.js";

export async function listStaffController(req, res, next) {
  try {
    const staff = await listStaff(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "Staff retrieved successfully.",
      data: { staff },
    });
  } catch (error) {
    return next(error);
  }
}
