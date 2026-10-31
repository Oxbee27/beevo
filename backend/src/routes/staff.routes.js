import { Router } from "express";

import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/require-owner.middleware.js";

import { createStaffController } from "../controllers/create-staff.controller.js";
import { listStaffController } from "../controllers/list-staff.controller.js";
import { getStaffController } from "../controllers/get-staff.controller.js";
import { updateStaffController } from "../controllers/update-staff.controller.js";
import { updateStaffStatusController } from "../controllers/update-staff-status.controller.js";

const router = Router();

router.use(authenticateToken);
router.use(requireOwner);

// Create a staff account.
router.post("/", createStaffController);

// List staff members.
router.get("/", listStaffController);

// Update account activation status.
router.patch("/:id/status", updateStaffStatusController);

// View an individual staff member.
router.get("/:id", getStaffController);

// Update staff details or role assignment.
router.patch("/:id", updateStaffController);

export default router;
