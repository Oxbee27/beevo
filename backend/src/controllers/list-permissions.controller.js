import { listPermissions } from "../services/list-permissions.service.js";

export async function listPermissionsController(req, res, next) {
  try {
    const permissions = await listPermissions();

    return res.status(200).json({
      success: true,
      message: "Permissions retrieved successfully.",
      data: { permissions },
    });
  } catch (error) {
    return next(error);
  }
}
