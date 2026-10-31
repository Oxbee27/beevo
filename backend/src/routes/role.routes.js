import { Router } from "express";

import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/require-owner.middleware.js";

import { createRoleController } from "../controllers/create-role.controller.js";
import { listRolesController } from "../controllers/list-roles.controller.js";
import { listPermissionsController } from "../controllers/list-permissions.controller.js";
import { updateRoleController } from "../controllers/update-role.controller.js";
import { deleteRoleController } from "../controllers/delete-role.controller.js";

const router = Router();

router.use(authenticateToken);
router.use(requireOwner);

// Create a custom role.
router.post("/", createRoleController);

// List all custom roles.
router.get("/", listRolesController);

// List all available permissions.
router.get("/permissions", listPermissionsController);

// Update a custom role.
router.patch("/:id", updateRoleController);

// Delete a custom role.
router.delete("/:id", deleteRoleController);

export default router;
