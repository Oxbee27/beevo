
import { enquiryIdSchema } from "../validators/enquiry-id.validator.js";
import { updateEnquirySchema } from "../validators/update-enquiry.validator.js";
import { updateEnquiry } from "../services/update-enquiry.service.js";

export async function updateEnquiryController(req, res, next) {
  try {
    const idValidation = enquiryIdSchema.safeParse(req.params);

    if (!idValidation.success) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid enquiry ID.",
      });
    }

    const bodyValidation = updateEnquirySchema.safeParse(req.body);

    if (!bodyValidation.success) {
      return res.status(400).json({
        success: false,
        message: "We couldn't update this enquiry. Please check the information and try again.",
        errors: bodyValidation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const enquiry = await updateEnquiry(
      req.user.businessId,
      idValidation.data.id,
      bodyValidation.data
    );

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "We couldn't find this enquiry.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enquiry updated successfully.",
      data: { enquiry },
    });
  } catch (error) {
    next(error);
  }
}
