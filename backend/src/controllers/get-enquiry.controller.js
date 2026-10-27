
import { enquiryIdSchema } from "../validators/enquiry-id.validator.js";
import { getEnquiry } from "../services/get-enquiry.service.js";

export async function getEnquiryController(req, res, next) {
  try {
    const validation = enquiryIdSchema.safeParse(req.params);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid enquiry ID.",
      });
    }

    const enquiry = await getEnquiry(
      req.user.businessId,
      validation.data.id
    );

    if (!enquiry) {
      return res.status(404).json({
        success: false,
        message: "Enquiry not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: { enquiry },
    });
  } catch (error) {
    next(error);
  }
}
