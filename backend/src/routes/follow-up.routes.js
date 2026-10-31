import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import { createFollowUpController } from "../controllers/create-follow-up.controller.js";
import { listFollowUpsController } from "../controllers/list-follow-ups.controller.js";
import { getFollowUpController } from "../controllers/get-follow-up.controller.js";
import { updateFollowUpController } from "../controllers/update-follow-up.controller.js";
import { deleteFollowUpController } from "../controllers/delete-follow-up.controller.js";
import {
  getUpcomingFollowUpsController,
} from "../controllers/get-upcoming-follow-ups.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", requirePermission("follow_ups.create"), createFollowUpController);
router.get("/", requirePermission("follow_ups.view"), listFollowUpsController);
router.get("/upcoming", requirePermission("follow_ups.view"), getUpcomingFollowUpsController);
router.get("/:id", requirePermission("follow_ups.view"), getFollowUpController);
router.patch("/:id", requirePermission("follow_ups.edit"), updateFollowUpController);
router.delete("/:id", requirePermission("follow_ups.delete"), deleteFollowUpController);

export default router;
