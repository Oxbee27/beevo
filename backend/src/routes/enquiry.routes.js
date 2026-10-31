import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import { createEnquiryController } from "../controllers/create-enquiry.controller.js";
import { listEnquiriesController } from "../controllers/list-enquiries.controller.js";
import { getEnquiryController } from "../controllers/get-enquiry.controller.js";
import { updateEnquiryController } from "../controllers/update-enquiry.controller.js";
import { deleteEnquiryController } from "../controllers/delete-enquiry.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", requirePermission("enquiries.create"), createEnquiryController);
router.get("/", requirePermission("enquiries.view"), listEnquiriesController);
router.get("/:id", requirePermission("enquiries.view"), getEnquiryController);
router.patch("/:id", requirePermission("enquiries.edit"), updateEnquiryController);
router.delete("/:id", requirePermission("enquiries.delete"), deleteEnquiryController);

export default router;
