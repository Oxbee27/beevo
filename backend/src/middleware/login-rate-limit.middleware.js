import { rateLimit } from "express-rate-limit";

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,

  handler: (req, res) => {
    return res.status(429).json({
      success: false,
      message: "Too many sign-in attempts. Please wait 15 minutes before trying again.",
    });
  },
});
