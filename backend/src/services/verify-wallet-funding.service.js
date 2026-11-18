import pool from "../config/database.js";

const MAX_BIGINT = 9223372036854775807n;

function serviceError(message, status, publicMessage = message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

function existingCreditResult(ledgerResult, attempt) {
  const ledger = ledgerResult.rows[0];

  if (
    ledgerResult.rowCount !== 1 ||
    !ledger ||
    ledger.transaction_type !== "credit" ||
    String(ledger.amount_kobo) !== String(attempt.amount_kobo) ||
    ledger.reference !== attempt.reference
  ) {
    throw serviceError(
      "Credited payment ledger record is inconsistent.",
      500,
      "We couldn't confirm your wallet funding record. Please contact support.",
    );
  }

  return {
    reference: attempt.reference,
    amountKobo: String(ledger.amount_kobo),
    balanceAfterKobo: String(ledger.balance_after_kobo),
    currency: "NGN",
    alreadyCredited: true,
  };
}

function isMatchingSuccessfulPayment(data, attempt) {
  if (
    !data ||
    data.status !== "success" ||
    data.reference !== attempt.reference ||
    data.currency !== "NGN" ||
    typeof data.amount !== "number" ||
    !Number.isSafeInteger(data.amount) ||
    data.amount < 0 ||
    data.metadata?.purpose !== "beevo_wallet_funding" ||
    String(data.metadata?.business_id) !== String(attempt.business_id)
  ) {
    return false;
  }

  try {
    return (
      BigInt(String(data.amount)) === BigInt(String(attempt.amount_kobo))
    );
  } catch {
    return false;
  }
}

export async function verifyWalletFunding(businessId, reference) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw serviceError(
      "Paystack is not configured.",
      503,
      "Wallet funding verification is temporarily unavailable. Please try again later.",
    );
  }

  // Resolve the payment attempt within the authenticated tenant.
  const attemptResult = await pool.query(
    `
      SELECT
        id,
        business_id,
        reference,
        amount_kobo,
        currency,
        provider,
        status,
        credited_at
      FROM wallet_payment_attempts
      WHERE business_id = $1
        AND reference = $2
        AND provider = 'paystack'
      LIMIT 1
    `,
    [businessId, reference],
  );

  if (attemptResult.rowCount === 0) {
    throw serviceError(
      "Wallet funding attempt not found.",
      404,
      "We couldn't find this funding request in your business account.",
    );
  }

  const attempt = attemptResult.rows[0];

  // A previously credited payment is idempotent: never contact Paystack
  // again or create another credit for it.
  if (attempt.status === "successful" && attempt.credited_at) {
    const existingLedger = await pool.query(
      `
        SELECT
          amount_kobo,
          balance_after_kobo,
          transaction_type,
          reference
        FROM wallet_transactions
        WHERE payment_attempt_id = $1
          AND business_id = $2
        LIMIT 1
      `,
      [attempt.id, businessId],
    );

    return existingCreditResult(existingLedger, attempt);
  }

  if (attempt.status !== "pending") {
    throw serviceError(
      "Wallet funding attempt is not pending.",
      409,
      "This funding request is no longer awaiting payment verification.",
    );
  }

  if (attempt.currency.trim() !== "NGN") {
    throw serviceError(
      "Unsupported wallet funding currency.",
      409,
      "This funding request uses an unsupported currency.",
    );
  }

  // Verify directly with Paystack. Never trust the browser callback.
  let providerResponse;
  let providerResult;

  try {
    providerResponse = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    providerResult = await providerResponse.json();
  } catch {
    throw serviceError(
      "Paystack verification could not be confirmed.",
      503,
      "We couldn't confirm your payment yet. Please wait briefly and check again.",
    );
  }

  if (
    !providerResponse.ok ||
    providerResult?.status !== true ||
    !isMatchingSuccessfulPayment(providerResult.data, attempt)
  ) {
    throw serviceError(
      "Paystack payment verification did not match the funding attempt.",
      409,
      "This payment has not been confirmed. Your wallet has not been credited.",
    );
  }

  const payment = providerResult.data;
  const client = await pool.connect();
  let releaseError;

  try {
    await client.query("BEGIN");

    // Serialize concurrent verification requests for this attempt.
    const lockedAttemptResult = await client.query(
      `
        SELECT
          id,
          business_id,
          reference,
          amount_kobo,
          currency,
          provider,
          status,
          credited_at
        FROM wallet_payment_attempts
        WHERE id = $1
          AND business_id = $2
        FOR UPDATE
      `,
      [attempt.id, businessId],
    );

    if (lockedAttemptResult.rowCount !== 1) {
      throw serviceError(
        "Wallet funding attempt not found.",
        404,
        "We couldn't find this funding request in your business account.",
      );
    }

    const lockedAttempt = lockedAttemptResult.rows[0];

    // Another request may have completed the credit while Paystack
    // verification was in progress.
    if (
      lockedAttempt.status === "successful" &&
      lockedAttempt.credited_at
    ) {
      const existingLedger = await client.query(
        `
          SELECT
            amount_kobo,
            balance_after_kobo,
            transaction_type,
            reference
          FROM wallet_transactions
          WHERE payment_attempt_id = $1
            AND business_id = $2
          LIMIT 1
        `,
        [attempt.id, businessId],
      );

      const result = existingCreditResult(existingLedger, lockedAttempt);

      await client.query("COMMIT");

      return result;
    }

    if (lockedAttempt.status !== "pending") {
      throw serviceError(
        "Wallet funding attempt is no longer pending.",
        409,
        "This funding request has already been processed or is no longer available.",
      );
    }

    if (
      String(lockedAttempt.amount_kobo) !== String(attempt.amount_kobo) ||
      lockedAttempt.reference !== reference ||
      String(lockedAttempt.business_id) !== String(businessId) ||
      String(lockedAttempt.currency).trim() !== "NGN" ||
      lockedAttempt.provider !== "paystack"
    ) {
      throw serviceError(
        "Wallet funding attempt changed during verification.",
        409,
        "We couldn't safely confirm this funding request. Please contact support.",
      );
    }

    // Lock the tenant's wallet before calculating its new balance.
    const walletResult = await client.query(
      `
        SELECT id, balance_kobo, currency
        FROM business_wallets
        WHERE business_id = $1
        FOR UPDATE
      `,
      [businessId],
    );

    if (walletResult.rowCount !== 1) {
      throw serviceError(
        "Business wallet not found.",
        404,
        "Your business wallet could not be found. Please contact support.",
      );
    }

    const wallet = walletResult.rows[0];

    if (wallet.currency.trim() !== "NGN") {
      throw serviceError(
        "Unsupported wallet currency.",
        409,
        "Your wallet uses an unsupported currency.",
      );
    }

    const amountKobo = BigInt(String(lockedAttempt.amount_kobo));
    const currentBalance = BigInt(String(wallet.balance_kobo));
    const newBalance = currentBalance + amountKobo;

    if (newBalance > MAX_BIGINT) {
      throw serviceError(
        "Wallet balance exceeds the supported limit.",
        409,
        "This payment cannot be added to the wallet. Please contact support.",
      );
    }

    const walletUpdateResult = await client.query(
      `
        UPDATE business_wallets
        SET
          balance_kobo = $2,
          updated_at = NOW()
        WHERE id = $1
          AND business_id = $3
      `,
      [wallet.id, newBalance.toString(), businessId],
    );

    if (walletUpdateResult.rowCount !== 1) {
      throw serviceError(
        "Wallet balance could not be updated.",
        409,
        "We couldn't safely update your wallet balance. Please contact support.",
      );
    }

    // The unique payment_attempt_id constraint is a second line of
    // defence against duplicate credits.
    await client.query(
      `
        INSERT INTO wallet_transactions (
          wallet_id,
          business_id,
          payment_attempt_id,
          transaction_type,
          amount_kobo,
          balance_after_kobo,
          reference,
          description,
          metadata
        )
        VALUES (
          $1, $2, $3, 'credit', $4, $5, $6,
          'Wallet funding via Paystack',
          $7::JSONB
        )
      `,
      [
        wallet.id,
        businessId,
        lockedAttempt.id,
        amountKobo.toString(),
        newBalance.toString(),
        reference,
        JSON.stringify({
          provider: "paystack",
          channel: payment.channel ?? null,
          providerReference: payment.reference,
        }),
      ],
    );

    // Record verification and credit only after the ledger insert
    // succeeds. This update commits atomically with the balance and ledger.
    const updateAttemptResult = await client.query(
      `
        UPDATE wallet_payment_attempts
        SET
          status = 'successful',
          verified_at = NOW(),
          credited_at = NOW(),
          channel = $2,
          gateway_response = $3::JSONB,
          updated_at = NOW()
        WHERE id = $1
          AND business_id = $4
          AND status = 'pending'
        RETURNING id
      `,
      [
        lockedAttempt.id,
        typeof payment.channel === "string" ? payment.channel : null,
        JSON.stringify({
          verification_status: payment.status,
          reference: payment.reference,
          amount: String(payment.amount),
          currency: payment.currency,
          channel: payment.channel ?? null,
          paid_at: payment.paid_at ?? null,
        }),
        businessId,
      ],
    );

    if (updateAttemptResult.rowCount !== 1) {
      throw serviceError(
        "Wallet funding status could not be updated.",
        409,
        "We couldn't complete this wallet credit. Please contact support.",
      );
    }

    await client.query("COMMIT");

    return {
      reference,
      amountKobo: amountKobo.toString(),
      balanceAfterKobo: newBalance.toString(),
      currency: "NGN",
      alreadyCredited: false,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Discard a connection that could not be safely rolled back.
      releaseError = rollbackError;
    }

    throw error;
  } finally {
    client.release(releaseError);
  }
}
