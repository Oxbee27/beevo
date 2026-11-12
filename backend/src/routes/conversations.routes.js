import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import {
  listConversationsController,
  getConversationController,
  classifyConversationController,
} from "../controllers/conversations.controller.js";

const router = Router();

router.use(authenticateToken);

router.get(
  "/",
  requirePermission("conversations.view"),
  listConversationsController,
);

router.get(
  "/:id",
  requirePermission("conversations.view"),
  getConversationController,
);

router.patch(
  "/:id/classification",
  requirePermission("conversations.edit"),
  classifyConversationController,
);

export default router;
