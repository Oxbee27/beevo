import { Router } from "express";
import { registerController } from "../controllers/register.controller.js";
import { loginController } from "../controllers/login.controller.js";

const router = Router();

router.post("/register", registerController);
router.post("/login", loginController);

export default router;