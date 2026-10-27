
import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";

import { createEnquiryController } from "../controllers/create-enquiry.controller.js";
import { listEnquiriesController } from "../controllers/list-enquiries.controller.js";
import { getEnquiryController } from "../controllers/get-enquiry.controller.js";
import { updateEnquiryController } from "../controllers/update-enquiry.controller.js";
import { deleteEnquiryController } from "../controllers/delete-enquiry.controller.js";

const router = Router();

router.use(authenticateToken);

router.post("/", createEnquiryController);
router.get("/", listEnquiriesController);
router.get("/:id", getEnquiryController);
router.patch("/:id", updateEnquiryController);
router.delete("/:id", deleteEnquiryController);

export default router;
