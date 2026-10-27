
import { enquiryIdSchema } from "../validators/enquiry-id.validator.js";
import { deleteEnquiry } from "../services/delete-enquiry.service.js";

export async function deleteEnquiryController(req, res, next) {
  try {
    const validation = enquiryIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid enquiry ID.",
      });
    }

    const deleted = await deleteEnquiry(
      req.user.businessId,
      validation.data.id
    );

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Enquiry deleted successfully.",
    });
  } catch (error) {
    next(error);
  }
}
