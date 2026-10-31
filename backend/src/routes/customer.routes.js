import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import { createCustomerController } from "../controllers/create-customer.controller.js";
import { listCustomersController } from "../controllers/list-customers.controller.js";
import { getCustomerController } from "../controllers/get-customer.controller.js";
import { updateCustomerController } from "../controllers/update-customer.controller.js";
import { deleteCustomerController } from "../controllers/delete-customer.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", requirePermission("customers.create"), createCustomerController);
router.get("/", requirePermission("customers.view"), listCustomersController);
router.get("/:id", requirePermission("customers.view"), getCustomerController);
router.patch("/:id", requirePermission("customers.edit"), updateCustomerController);
router.delete("/:id", requirePermission("customers.delete"), deleteCustomerController);

export default router;
