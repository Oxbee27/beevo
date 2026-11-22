import { Router } from "express";
import { requireOwner } from "../middleware/require-owner.middleware.js";
import {
  getBusinessCommunicationSettingsController,
  updateBusinessCommunicationSettingsController,
} from "../controllers/business-communication-settings.controller.js";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import {
  getCommunicationChannelsController,
  getCommunicationsMessageController,
  getCommunicationsOverviewController,
  listCommunicationsMessagesController,
  retryCommunicationsMessageController,
} from "../controllers/communications.controller.js";

import {
  cancelFollowUpMessageController,
} from "../controllers/follow-up-messages.controller.js";

const router = Router();

router.use(authenticateToken);

router.get(
  "/business-settings",
  requireOwner,
  getBusinessCommunicationSettingsController,
);

router.patch(
  "/business-settings",
  requireOwner,
  updateBusinessCommunicationSettingsController,
);


router.get(
  "/channels",
  requirePermission("communications.view"),
  getCommunicationChannelsController,
);

router.get(
  "/overview",
  requirePermission("communications.view"),
  getCommunicationsOverviewController,
);

router.get(
  "/messages",
  requirePermission("communications.view"),
  listCommunicationsMessagesController,
);

router.get(
  "/messages/:id",
  requirePermission("communications.view"),
  getCommunicationsMessageController,
);

router.patch(
  "/messages/:id/cancel",
  requirePermission("communications.edit"),
  (req, res, next) => {
    req.params.messageId = req.params.id;
    return cancelFollowUpMessageController(req, res, next);
  },
);

router.post(
  "/messages/:id/retry",
  requirePermission("communications.edit"),
  retryCommunicationsMessageController,
);

export default router;
