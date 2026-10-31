import { Router } from "express";
import { registerController } from "../controllers/register.controller.js";
import { loginController } from "../controllers/login.controller.js";
import { loginRateLimit } from "../middleware/login-rate-limit.middleware.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginRateLimit, loginController);

export default router;
