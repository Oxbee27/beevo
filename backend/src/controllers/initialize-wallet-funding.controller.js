import { initializeWalletFundingSchema } from "../validators/wallet-funding.validator.js";
import { initializeWalletFunding } from "../services/initialize-wallet-funding.service.js";

export async function initializeWalletFundingController(req, res, next) {
  try {
    const parsed = initializeWalletFundingSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid funding amount and request key.",
      });
    }

    const result = await initializeWalletFunding(
      req.user.businessId,
      req.user.id,
      parsed.data,
    );

    return res.status(200).json({
      success: true,
      message: "Your wallet checkout is ready.",
      data: {
        checkout: result,
      },
    });
  } catch (error) {
    return next(error);
  }
}
