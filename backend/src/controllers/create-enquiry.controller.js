
import { createEnquirySchema } from "../validators/create-enquiry.validator.js";
import { createEnquiry } from "../services/create-enquiry.service.js";

export async function createEnquiryController(req, res, next) {
  try {
    const validation = createEnquirySchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        success: false,
        message: "Invalid enquiry data.",
        errors: validation.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const enquiry = await createEnquiry(
      req.user.businessId,
      req.user.id,
      validation.data
    );

    return res.status(201).json({
      success: true,
      message: "Enquiry created successfully.",
      data: { enquiry },
    });
  } catch (error) {
    next(error);
  }
}
