import { getDashboardSummary } from "../services/get-dashboard-summary.service.js";

export async function getDashboardSummaryController(req, res, next) {
  try {
    const summary = await getDashboardSummary(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "Dashboard summary retrieved successfully.",
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}
