import { createFollowUpSchema } from "../validators/create-follow-up.validator.js";
import { createFollowUp } from "../services/create-follow-up.service.js";

export async function createFollowUpController(req, res, next) {
  try {
    const validation = createFollowUpSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed.",
        errors: validation.error.issues,
      });
    }

    const followUp = await createFollowUp(
      req.user.businessId,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Follow-up created successfully.",
      data: { followUp },
    });
  } catch (error) {
    next(error);
  }
}
