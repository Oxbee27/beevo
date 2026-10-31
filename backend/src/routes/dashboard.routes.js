import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";
import { getDashboardSummaryController } from "../controllers/get-dashboard-summary.controller.js";

const router = Router();

router.use(authenticateToken);

router.get(
  "/summary",
  requirePermission("dashboard.view"),
  getDashboardSummaryController
);

export default router;
