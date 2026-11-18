import { listWalletTransactions } from "../services/list-wallet-transactions.service.js";

function parsePositiveInteger(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "string" ||
    !/^[1-9]\d*$/.test(value)
  ) {
    return null;
  }

  const parsed = Number(value);

  return Number.isSafeInteger(parsed) ? parsed : null;
}

export async function listWalletTransactionsController(req, res, next) {
  try {
    const page = parsePositiveInteger(req.query.page, 1);
    const requestedLimit = parsePositiveInteger(req.query.limit, 20);

    if (page === null || requestedLimit === null) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid page and transaction limit.",
      });
    }

    const limit = Math.min(requestedLimit, 100);
    const offset = (page - 1) * limit;

    if (!Number.isSafeInteger(offset)) {
      return res.status(400).json({
        success: false,
        message: "Please provide valid pagination details.",
      });
    }

    const result = await listWalletTransactions(
      req.user.businessId,
      { page, limit }
    );

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
}
