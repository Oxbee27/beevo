import { Router } from "express";

import { authenticateToken } from "../middleware/auth.middleware.js";
import { requireOwner } from "../middleware/require-owner.middleware.js";

import { getBusinessWalletController } from "../controllers/get-business-wallet.controller.js";
import { listWalletTransactionsController } from "../controllers/list-wallet-transactions.controller.js";
import { initializeWalletFundingController } from "../controllers/initialize-wallet-funding.controller.js";
import { verifyWalletFundingController } from "../controllers/verify-wallet-funding.controller.js";

const router = Router();

router.use(authenticateToken);
router.use(requireOwner);

router.get("/", getBusinessWalletController);
router.get("/transactions", listWalletTransactionsController);
router.post("/funding/initialize", initializeWalletFundingController);
router.post("/funding/verify", verifyWalletFundingController);

export default router;
