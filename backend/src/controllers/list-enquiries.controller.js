
import { listEnquiries } from "../services/list-enquiries.service.js";

export async function listEnquiriesController(req, res, next) {
  try {
    const enquiries = await listEnquiries(req.user.businessId);

    return res.status(200).json({
      success: true,
      count: enquiries.length,
      data: { enquiries },
    });
  } catch (error) {
    next(error);
  }
}
