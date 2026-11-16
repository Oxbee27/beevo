import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/require-owner.middleware.js";
import { getResendDiagnostic } from "../controllers/resend-diagnostic.controller.js";

const router = Router();

router.use(authenticateToken);
router.use(requireOwner);

router.get("/resend-webhook", getResendDiagnostic);

export default router;
