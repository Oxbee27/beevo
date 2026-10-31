import { listRoles } from "../services/list-roles.service.js";

export async function listRolesController(req, res, next) {
  try {
    const roles = await listRoles(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "Roles retrieved successfully.",
      data: { roles },
    });
  } catch (error) {
    return next(error);
  }
}
