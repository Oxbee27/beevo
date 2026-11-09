import { followUpIdSchema } from "../validators/follow-up-id.validator.js";
import { updateFollowUpSchema } from "../validators/update-follow-up.validator.js";
import { updateFollowUp } from "../services/update-follow-up.service.js";

export async function updateFollowUpController(req, res, next) {
  try {
    const idValidation = followUpIdSchema.safeParse(req.params);

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid follow-up ID.",
        errors: idValidation.error.issues,
      });
    }

    const bodyValidation = updateFollowUpSchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Some of the information you entered needs attention. Please review it and try again.",
        errors: bodyValidation.error.issues,
      });
    }

    const followUp = await updateFollowUp(
      req.user.businessId,
      idValidation.data.id,
      bodyValidation.data
    );

    if (!followUp) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find this follow-up.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Follow-up updated successfully.",
      data: { followUp },
    });
  } catch (error) {
    next(error);
  }
}
