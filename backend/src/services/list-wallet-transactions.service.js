import pool from "../config/database.js";

export async function listWalletTransactions(
  businessId,
  { page = 1, limit = 20 } = {}
) {
  const offset = (page - 1) * limit;

  const [transactionsResult, countResult] = await Promise.all([
    pool.query(
      `
      SELECT
        id,
        transaction_type,
        amount_kobo,
        balance_after_kobo,
        reference,
        description,
        metadata,
        created_at
      FROM wallet_transactions
      WHERE business_id = $1
      ORDER BY created_at DESC, id DESC
      LIMIT $2
      OFFSET $3
      `,
      [businessId, limit, offset]
    ),

    pool.query(
      `
      SELECT COUNT(*)::BIGINT AS total
      FROM wallet_transactions
      WHERE business_id = $1
      `,
      [businessId]
    ),
  ]);

  const totalBigInt = BigInt(countResult.rows[0].total);

  if (
    totalBigInt < 0n ||
    totalBigInt > BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    const error = new Error("Wallet transaction count exceeds the supported limit.");
    error.status = 503;
    error.publicMessage =
      "Wallet transaction history is temporarily unavailable. Please try again later.";
    throw error;
  }

  const total = Number(totalBigInt);
  const totalPagesBigInt =
    (totalBigInt + BigInt(limit) - 1n) / BigInt(limit);

  if (totalPagesBigInt > BigInt(Number.MAX_SAFE_INTEGER)) {
    const error = new Error("Wallet transaction page count exceeds the supported limit.");
    error.status = 503;
    error.publicMessage =
      "Wallet transaction history is temporarily unavailable. Please try again later.";
    throw error;
  }

  return {
    transactions: transactionsResult.rows.map((transaction) => ({
      id: String(transaction.id),
      type: transaction.transaction_type,
      amountKobo: String(transaction.amount_kobo),
      balanceAfterKobo: String(transaction.balance_after_kobo),
      reference: transaction.reference,
      description: transaction.description,
      metadata: transaction.metadata,
      createdAt: transaction.created_at,
    })),
    pagination: {
      page,
      limit,
      total,
      totalPages: Number(totalPagesBigInt),
    },
  };
}
