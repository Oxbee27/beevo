import { followUpIdSchema } from "../validators/follow-up-id.validator.js";
import { deleteFollowUp } from "../services/delete-follow-up.service.js";

export async function deleteFollowUpController(req, res, next) {
  try {
    const validation = followUpIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid follow-up ID.",
        errors: validation.error.issues,
      });
    }

    const deleted = await deleteFollowUp(
      req.user.businessId,
      validation.data.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Follow-up deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}
