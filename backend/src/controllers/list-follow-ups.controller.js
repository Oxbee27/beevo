import { listFollowUps } from "../services/list-follow-ups.service.js";

export async function listFollowUpsController(req, res, next) {
  try {
    const followUps = await listFollowUps(req.user.businessId);

    return res.status(200).json({
      success: true,
      message: "Follow-ups retrieved successfully.",
      count: followUps.length,
      data: { followUps },
    });
  } catch (error) {
    next(error);
  }
}
