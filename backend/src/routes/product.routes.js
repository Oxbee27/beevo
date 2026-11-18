import { Router } from "express";
import { authenticateToken } from "../middleware/auth.middleware.js";
import { requirePermission } from "../middleware/require-permission.middleware.js";

import { createProductController } from "../controllers/create-product.controller.js";
import { listProductsController } from "../controllers/list-products.controller.js";
import { getProductController } from "../controllers/get-product.controller.js";
import { updateProductController } from "../controllers/update-product.controller.js";
import { deleteProductController } from "../controllers/delete-product.controller.js";

import { createProductInterestController } from "../controllers/create-product-interest.controller.js";
import { listProductInterestsController } from "../controllers/list-product-interests.controller.js";
import { updateProductInterestController } from "../controllers/update-product-interest.controller.js";

const router = Router();

router.use(authenticateToken);

// Product interest routes must appear before the general /:id routes.
router.post(
  "/:productId/interests",
  requirePermission("restock.create"),
  createProductInterestController
);

router.get(
  "/:productId/interests",
  requirePermission("restock.view"),
  listProductInterestsController
);

router.patch(
  "/:productId/interests/:interestId",
  requirePermission("restock.edit"),
  updateProductInterestController
);

router.post("/", requirePermission("products.create"), createProductController);
router.get("/", requirePermission("products.view"), listProductsController);
router.get("/:id", requirePermission("products.view"), getProductController);
router.patch("/:id", requirePermission("products.edit"), updateProductController);
router.delete("/:id", requirePermission("products.delete"), deleteProductController);

export default router;
