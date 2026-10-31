import { deleteRole } from "../services/delete-role.service.js";

export async function deleteRoleController(req, res, next) {
  try {
    const role = await deleteRole(
      req.user.businessId,
      req.params.id
    );

    return res.status(200).json({
      success: true,
      message: "Role deleted successfully.",
      data: { role },
    });
  } catch (error) {
    return next(error);
  }
}
