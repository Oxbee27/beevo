
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";

import { createCustomerController } from "../controllers/create-customer.controller.js";
import { listCustomersController } from "../controllers/list-customers.controller.js";
import { getCustomerController } from "../controllers/get-customer.controller.js";
import { updateCustomerController } from "../controllers/update-customer.controller.js";
import { deleteCustomerController } from "../controllers/delete-customer.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", createCustomerController);
router.get("/", listCustomersController);
router.get("/:id", getCustomerController);
router.patch("/:id", updateCustomerController);
router.delete("/:id", deleteCustomerController);

export default router;
