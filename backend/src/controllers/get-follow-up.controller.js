import { followUpIdSchema } from "../validators/follow-up-id.validator.js";
import { getFollowUp } from "../services/get-follow-up.service.js";

export async function getFollowUpController(req, res, next) {
  try {
    const validation = followUpIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid follow-up ID.",
        errors: validation.error.issues,
      });
    }

    const followUp = await getFollowUp(
      req.user.businessId,
      validation.data.id
    );

    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: "Follow-up not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Follow-up retrieved successfully.",
      data: { followUp },
    });
  } catch (error) {
    next(error);
  }
}
