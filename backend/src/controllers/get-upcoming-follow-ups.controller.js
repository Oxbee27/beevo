import {
  getUpcomingFollowUps,
} from "../services/get-upcoming-follow-ups.service.js";

export async function getUpcomingFollowUpsController(req, res, next) {
  try {
    const followUps = await getUpcomingFollowUps(
      req.user.businessId
    );

    return res.status(200).json({
      success: true,
      message: "Upcoming follow-ups retrieved successfully.",
      count: followUps.length,
      data: {
        followUps,
      },
    });
  } catch (error) {
    next(error);
  }
}
