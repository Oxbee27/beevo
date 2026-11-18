import { randomUUID } from "node:crypto";
import pool from "../config/database.js";

function serviceError(message, status, publicMessage = message) {
  const error = new Error(message);
  error.status = status;
  error.publicMessage = publicMessage;
  return error;
}

function getCheckoutDetails(attempt) {
  const response = attempt.gateway_response ?? {};
  let checkoutUrl = null;

  try {
    checkoutUrl = new URL(response.authorization_url);
  } catch {
    checkoutUrl = null;
  }

  const accessCode = response.access_code;

  if (
    attempt.status === "pending" &&
    checkoutUrl &&
    checkoutUrl.protocol === "https:" &&
    checkoutUrl.hostname === "checkout.paystack.com" &&
    !checkoutUrl.username &&
    !checkoutUrl.password &&
    !checkoutUrl.port &&
    checkoutUrl.pathname !== "/" &&
    typeof accessCode === "string" &&
    accessCode.trim().length > 0
  ) {
    return {
      reference: attempt.reference,
      amountKobo: String(attempt.amount_kobo),
      currency: "NGN",
      authorizationUrl: checkoutUrl.toString(),
      accessCode,
      alreadyInitialized: true,
    };
  }

  return null;
}

async function findExistingAttempt(businessId, idempotencyKey) {
  const result = await pool.query(
    `
      SELECT
        id,
        business_id,
        reference,
        amount_kobo,
        status,
        gateway_response
      FROM wallet_payment_attempts
      WHERE business_id = $1
        AND idempotency_key = $2
      LIMIT 1
    `,
    [businessId, idempotencyKey],
  );

  return result.rows[0] ?? null;
}

export async function initializeWalletFunding(
  businessId,
  userId,
  input,
) {
  if (!process.env.PAYSTACK_SECRET_KEY) {
    throw serviceError(
      "Paystack is not configured.",
      503,
      "Wallet funding is temporarily unavailable. Please try again later.",
    );
  }

  // A business owner's verified account email is used for checkout.
  const ownerResult = await pool.query(
    `
      SELECT email
      FROM users
      WHERE id = $1
        AND business_id = $2
        AND role = 'owner'
        AND is_active = TRUE
      LIMIT 1
    `,
    [userId, businessId],
  );

  const email = ownerResult.rows[0]?.email;

  if (
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw serviceError(
      "The business owner email is unavailable.",
      422,
      "Please ensure your business account has a valid email address before funding your wallet.",
    );
  }

  // Return an existing checkout for an identical idempotent request.
  const existing = await findExistingAttempt(
    businessId,
    input.idempotencyKey,
  );

  if (existing) {
    if (String(existing.amount_kobo) !== input.amountKobo) {
      throw serviceError(
        "Idempotency key reused with a different amount.",
        409,
        "This request key has already been used with a different funding amount. Please start a new request.",
      );
    }

    const checkout = getCheckoutDetails(existing);

    if (checkout) {
      return checkout;
    }

    if (existing.status === "pending") {
      throw serviceError(
        "The existing funding request is still being processed.",
        409,
        "Your funding request is still being processed. Please wait a little before trying again.",
      );
    }

    throw serviceError(
      "The previous funding attempt did not complete.",
      409,
      "This funding request could not be completed. Please start a new request.",
    );
  }

  const reference = `BEEVO-${randomUUID()}`;

  // Create the local attempt before contacting Paystack.
  const insertResult = await pool.query(
    `
      INSERT INTO wallet_payment_attempts (
        business_id,
        reference,
        idempotency_key,
        provider,
        amount_kobo,
        currency,
        status
      )
      VALUES ($1, $2, $3, 'paystack', $4, 'NGN', 'pending')
      ON CONFLICT (business_id, idempotency_key)
      DO NOTHING
      RETURNING id, reference, amount_kobo, status, gateway_response
    `,
    [
      businessId,
      reference,
      input.idempotencyKey,
      input.amountKobo,
    ],
  );

  if (insertResult.rowCount === 0) {
    // Another request may have inserted the same key concurrently.
    const concurrentAttempt = await findExistingAttempt(
      businessId,
      input.idempotencyKey,
    );

    if (
      !concurrentAttempt ||
      String(concurrentAttempt.amount_kobo) !== input.amountKobo
    ) {
      throw serviceError(
        "Funding request conflict.",
        409,
        "This funding request conflicts with an existing request. Please try again with a new request key.",
      );
    }

    const checkout = getCheckoutDetails(concurrentAttempt);

    if (checkout) {
      return checkout;
    }

    throw serviceError(
      "Funding request is already being processed.",
      409,
      "Your funding request is already being processed. Please wait a little before trying again.",
    );
  }

  const attempt = insertResult.rows[0];

  const payload = {
    email,
    amount: input.amountKobo,
    currency: "NGN",
    reference: attempt.reference,
    metadata: {
      business_id: String(businessId),
      purpose: "beevo_wallet_funding",
    },
  };

  if (process.env.PAYSTACK_CALLBACK_URL) {
    payload.callback_url = process.env.PAYSTACK_CALLBACK_URL;
  }

  let response;
  let result;

  try {
    response = await fetch(
      "https://api.paystack.co/transaction/initialize",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    );

    result = await response.json();
  } catch {
    // The request may have reached Paystack. Keep the attempt pending
    // rather than risking a duplicate payment initialization.
    throw serviceError(
      "Paystack initialization could not be confirmed.",
      503,
      "We couldn't confirm your checkout request. Please wait briefly and try again using the same request.",
    );
  }

  if (!response.ok || result?.status !== true) {
    let failurePersistence;

    try {
      failurePersistence = await pool.query(
        `
          UPDATE wallet_payment_attempts
          SET status = 'failed',
              gateway_response = $2::JSONB,
              updated_at = NOW()
          WHERE id = $1 AND status = 'pending'
          RETURNING id
        `,
        [
          attempt.id,
          JSON.stringify({
            message:
              typeof result?.message === "string"
                ? result.message.slice(0, 300)
                : "Paystack rejected the initialization request.",
            http_status: response.status,
          }),
        ],
      );
    } catch {
      throw serviceError(
        "Funding attempt failure could not be persisted.",
        503,
        "We couldn't confirm the funding request status. Please contact support before trying again.",
      );
    }

    if (failurePersistence.rowCount !== 1) {
      throw serviceError(
        "Funding attempt failure could not be persisted.",
        503,
        "We couldn't confirm the funding request status. Please contact support before trying again.",
      );
    }

    throw serviceError(
      "Paystack rejected the funding request.",
      502,
      "We couldn't start your wallet funding. Please try again with a new request.",
    );
  }

  const data = result.data;
  const authorizationUrl = data?.authorization_url;
  const returnedReference = data?.reference;

  let checkoutUrl;

  try {
    checkoutUrl = new URL(authorizationUrl);
  } catch {
    checkoutUrl = null;
  }

  if (
    !checkoutUrl ||
    checkoutUrl.protocol !== "https:" ||
    checkoutUrl.hostname !== "checkout.paystack.com" ||
    returnedReference !== attempt.reference ||
    typeof data?.access_code !== "string"
  ) {
    // Do not mark this attempt failed: Paystack may have created a
    // checkout session, and its outcome needs reconciliation.
    throw serviceError(
      "Paystack returned an unexpected checkout response.",
      502,
      "We couldn't confirm your checkout details. Please contact support before starting another funding request.",
    );
  }

  const safeGatewayResponse = {
    authorization_url: checkoutUrl.toString(),
    access_code: data.access_code,
    reference: returnedReference,
  };

  try {
    const persistenceResult = await pool.query(
      `
        UPDATE wallet_payment_attempts
        SET
          provider_reference = $2,
          gateway_response = $3::JSONB,
          updated_at = NOW()
        WHERE id = $1
          AND status = 'pending'
        RETURNING id
      `,
      [
        attempt.id,
        returnedReference,
        JSON.stringify(safeGatewayResponse),
      ],
    );

    if (persistenceResult.rowCount !== 1) {
      throw new Error("Checkout details were not persisted.");
    }
  } catch {
    // Paystack may already have created the checkout. Preserve the
    // pending attempt and require reconciliation instead of retrying
    // with a new reference.
    throw serviceError(
      "Checkout persistence failed.",
      503,
      "Your checkout request may have been created, but we couldn't save its details. Please contact support before trying again.",
    );
  }

  return {
    reference: attempt.reference,
    amountKobo: String(attempt.amount_kobo),
    currency: "NGN",
    authorizationUrl: checkoutUrl.toString(),
    accessCode: data.access_code,
    alreadyInitialized: false,
  };
}
