import { Router } from "express";

import { registerController } from "../controllers/register.controller.js";
import { loginController } from "../controllers/login.controller.js";
import { changePasswordController } from "../controllers/change-password.controller.js";
import { forgotPasswordController } from "../controllers/forgot-password.controller.js";
import { resetPasswordController } from "../controllers/reset-password.controller.js";

import { loginRateLimit } from "../middleware/login-rate-limit.middleware.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginRateLimit, loginController);

router.patch(
  "/change-password",
  authenticateToken,
  loginRateLimit,
  changePasswordController
);

router.post(
  "/forgot-password",
  loginRateLimit,
  forgotPasswordController
);

router.post(
  "/reset-password",
  loginRateLimit,
  resetPasswordController
);

export default router;
