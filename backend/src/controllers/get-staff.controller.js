import { getStaff } from "../services/get-staff.service.js";

export async function getStaffController(req, res, next) {
  try {
    const staff = await getStaff(
      req.user.businessId,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Staff member retrieved successfully.",
      data: { staff },
    });
  } catch (error) {
    return next(error);
  }
}
