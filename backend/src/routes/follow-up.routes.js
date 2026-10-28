import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";

import { createFollowUpController } from "../controllers/create-follow-up.controller.js";
import { listFollowUpsController } from "../controllers/list-follow-ups.controller.js";
import { getFollowUpController } from "../controllers/get-follow-up.controller.js";
import { updateFollowUpController } from "../controllers/update-follow-up.controller.js";
import { deleteFollowUpController } from "../controllers/delete-follow-up.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", createFollowUpController);
router.get("/", listFollowUpsController);
router.get("/:id", getFollowUpController);
router.patch("/:id", updateFollowUpController);
router.delete("/:id", deleteFollowUpController);

export default router;
