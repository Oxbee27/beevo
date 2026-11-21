import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";
import { requireOwner } from "../middleware/require-owner.middleware.js";

import {
  listConversationsController,
  getConversationController,
  classifyConversationController,
  listPendingConversationsController,
  getPendingConversationController,
} from "../controllers/conversations.controller.js";

const router = Router();

router.use(authenticateToken);

// Pending message content is strictly owner-only.
router.get(
  "/inbox",
  requireOwner,
  listPendingConversationsController,
);

router.get(
  "/inbox/:id",
  requireOwner,
  getPendingConversationController,
);

// Existing classified conversation access remains permission-based.
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

// Classification is an owner decision because it controls message retention.
router.patch(
  "/:id/classification",
  requireOwner,
  classifyConversationController,
);

export default router;
