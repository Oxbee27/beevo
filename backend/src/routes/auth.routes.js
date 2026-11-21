import { Router } from "express";

import { registerController } from "../controllers/register.controller.js";
import { loginController } from "../controllers/login.controller.js";
import { googleLoginController } from "../controllers/google-login.controller.js";
import { changePasswordController } from "../controllers/change-password.controller.js";
import { forgotPasswordController } from "../controllers/forgot-password.controller.js";
import { resetPasswordController } from "../controllers/reset-password.controller.js";
import { logoutController } from "../controllers/logout.controller.js";

import { loginRateLimit } from "../middleware/login-rate-limit.middleware.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { clearAuthCookie } from "../utils/auth-cookie.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginRateLimit, loginController);
router.post("/google", loginRateLimit, googleLoginController);

router.post("/logout", authenticateToken, logoutController);

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
