import { verifyWalletFundingSchema } from "../validators/wallet-funding-verification.validator.js";
import { verifyWalletFunding } from "../services/verify-wallet-funding.service.js";

export async function verifyWalletFundingController(req, res, next) {
  try {
    const parsed = verifyWalletFundingSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid payment reference.",
      });
    }

    const result = await verifyWalletFunding(
      req.user.businessId,
      parsed.data.reference,
    );

    return res.status(200).json({
      success: true,
      message: result.alreadyCredited
        ? "This payment has already been added to your wallet."
        : "Your wallet has been funded successfully.",
      data: {
        funding: result,
      },
    });
  } catch (error) {
    return next(error);
  }
}
