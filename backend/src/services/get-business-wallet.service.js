import pool from "../config/database.js";

export async function getBusinessWallet(businessId) {
  const result = await pool.query(
    `
    SELECT
      id,
      business_id,
      currency,
      balance_kobo,
      created_at,
      updated_at
    FROM business_wallets
    WHERE business_id = $1
    LIMIT 1
    `,
    [businessId]
  );

  if (result.rowCount === 0) {
    const error = new Error("Business wallet not found.");
    error.status = 404;
    throw error;
  }

  const wallet = result.rows[0];

  return {
    id: String(wallet.id),
    businessId: String(wallet.business_id),
    currency: wallet.currency.trim(),
    balanceKobo: String(wallet.balance_kobo),
    createdAt: wallet.created_at,
    updatedAt: wallet.updated_at,
  };
}
