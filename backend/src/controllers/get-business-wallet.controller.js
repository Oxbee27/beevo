import { getBusinessWallet } from "../services/get-business-wallet.service.js";

export async function getBusinessWalletController(req, res, next) {
  try {
    const wallet = await getBusinessWallet(req.user.businessId);

    return res.status(200).json({
      success: true,
      data: { wallet },
    });
  } catch (error) {
    return next(error);
  }
}
