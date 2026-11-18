import { randomUUID } from "node:crypto";

function billingError(message, code, status = 409) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.publicMessage = message;
  return error;
}

const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

const GSM_EXTENDED = "^{}\\[~]|€";

export function calculateSmsSegments(body) {
  if (typeof body !== "string" || body.length === 0) {
    throw billingError(
      "The SMS message must contain text.",
      "INVALID_SMS_BODY",
      400,
    );
  }

  let gsmUnits = 0;
  let isGsm = true;

  for (const character of body) {
    if (GSM_BASIC.includes(character)) {
      gsmUnits += 1;
    } else if (GSM_EXTENDED.includes(character)) {
      gsmUnits += 2;
    } else {
      isGsm = false;
      break;
    }
  }

  if (isGsm) {
    return gsmUnits <= 160
      ? 1
      : Math.ceil(gsmUnits / 153);
  }

  const unicodeUnits = [...body].reduce(
    (total, character) =>
      total + (character.codePointAt(0) > 0xffff ? 2 : 1),
    0,
  );

  return unicodeUnits <= 70
    ? 1
    : Math.ceil(unicodeUnits / 67);
}

function getUnitCount(message) {
  switch (message.channel) {
    case "email":
    case "whatsapp":
      return 1;

    case "sms":
      return calculateSmsSegments(message.body);

    default:
      throw billingError(
        "This communication channel is not supported for billing.",
        "UNSUPPORTED_BILLING_CHANNEL",
        400,
      );
  }
}

/**
 * Reserve money before contacting the communication provider.
 *
 * Wallet locking serializes concurrent reservations and prevents
 * two workers from spending the same available balance.
 */
export async function reserveCommunicationFunds(db, message) {
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const rateResult = await client.query(
      `
        SELECT channel, unit_name, rate_kobo
        FROM communication_channel_rates
        WHERE channel = $1
          AND enabled = TRUE
          AND rate_kobo IS NOT NULL
        FOR SHARE
      `,
      [message.channel],
    );

    if (rateResult.rowCount !== 1) {
      throw billingError(
        "Communication billing is not configured for this channel. Please contact the business administrator.",
        "COMMUNICATION_RATE_UNAVAILABLE",
        503,
      );
    }

    const rate = rateResult.rows[0];
    const unitCount = getUnitCount(message);

    if (
      (message.channel === "sms" && rate.unit_name !== "segment") ||
      (message.channel !== "sms" && rate.unit_name !== "message")
    ) {
      throw billingError(
        "The configured communication billing unit is invalid.",
        "INVALID_COMMUNICATION_RATE",
        500,
      );
    }

    const unitRate = BigInt(rate.rate_kobo);
    const amount = unitRate * BigInt(unitCount);
    const maximumBigInt = 9223372036854775807n;

    if (amount <= 0n || amount > maximumBigInt) {
      throw billingError(
        "The communication charge exceeds the supported amount.",
        "COMMUNICATION_AMOUNT_INVALID",
        400,
      );
    }

    const walletResult = await client.query(
      `
        SELECT id, balance_kobo, currency
        FROM business_wallets
        WHERE business_id = $1
        FOR UPDATE
      `,
      [message.business_id],
    );

    if (walletResult.rowCount !== 1) {
      throw billingError(
        "The business wallet could not be found.",
        "BUSINESS_WALLET_NOT_FOUND",
        404,
      );
    }

    const wallet = walletResult.rows[0];

    if (wallet.currency !== "NGN") {
      throw billingError(
        "The business wallet currency is not supported.",
        "UNSUPPORTED_WALLET_CURRENCY",
        409,
      );
    }

    const reservedResult = await client.query(
      `
        SELECT COALESCE(SUM(amount_kobo), 0)::TEXT AS reserved_kobo
        FROM wallet_reservations
        WHERE business_id = $1
          AND wallet_id = $2
          AND status = 'reserved'
      `,
      [message.business_id, wallet.id],
    );

    const balance = BigInt(wallet.balance_kobo);
    const reserved = BigInt(reservedResult.rows[0].reserved_kobo);
    const available = balance - reserved;

    if (available < amount) {
      throw billingError(
        "Insufficient available wallet balance. Please fund the business wallet before sending this message.",
        "INSUFFICIENT_COMMUNICATION_BALANCE",
        402,
      );
    }

    const inserted = await client.query(
      `
        INSERT INTO wallet_reservations (
          business_id,
          wallet_id,
          message_id,
          attempt_number,
          channel,
          unit_count,
          unit_rate_kobo,
          amount_kobo,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'reserved')
        ON CONFLICT (business_id, message_id, attempt_number)
        DO NOTHING
        RETURNING id, amount_kobo, status
      `,
      [
        message.business_id,
        wallet.id,
        message.id,
        message.attempt_count,
        message.channel,
        unitCount,
        unitRate.toString(),
        amount.toString(),
      ],
    );

    let reservation = inserted.rows[0];

    if (!reservation) {
      const existing = await client.query(
        `
          SELECT id, amount_kobo, status, channel, unit_count,
                 unit_rate_kobo
          FROM wallet_reservations
          WHERE business_id = $1
            AND message_id = $2
            AND attempt_number = $3
          FOR UPDATE
        `,
        [
          message.business_id,
          message.id,
          message.attempt_count,
        ],
      );

      reservation = existing.rows[0];

      if (
        !reservation ||
        reservation.status !== "reserved" ||
        reservation.channel !== message.channel ||
        Number(reservation.unit_count) !== unitCount ||
        BigInt(reservation.unit_rate_kobo) !== unitRate ||
        BigInt(reservation.amount_kobo) !== amount
      ) {
        throw billingError(
          "The communication attempt already has a conflicting billing reservation.",
          "COMMUNICATION_RESERVATION_CONFLICT",
          409,
        );
      }
    }

    await client.query("COMMIT");

    return {
      reservationId: String(reservation.id),
      amountKobo: String(reservation.amount_kobo),
      unitCount,
      unitRateKobo: unitRate.toString(),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Capture an existing reservation inside the caller's transaction.
 * The reservation and wallet ledger debit become durable together.
 */
export async function captureCommunicationReservation(
  client,
  message,
) {
  const reservationResult = await client.query(
    `
      SELECT *
      FROM wallet_reservations
      WHERE business_id = $1
        AND message_id = $2
        AND attempt_number = $3
      FOR UPDATE
    `,
    [
      message.business_id,
      message.id,
      message.attempt_count,
    ],
  );

  if (reservationResult.rowCount !== 1) {
    throw billingError(
      "Beevo could not find the communication billing reservation.",
      "COMMUNICATION_RESERVATION_NOT_FOUND",
      409,
    );
  }

  const reservation = reservationResult.rows[0];

  if (reservation.status === "captured") {
    const existingLedger = await client.query(
      `
        SELECT id
        FROM wallet_transactions
        WHERE reservation_id = $1
          AND business_id = $2
          AND transaction_type = 'debit'
      `,
      [reservation.id, message.business_id],
    );

    if (existingLedger.rowCount !== 1) {
      throw billingError(
        "The captured communication reservation has an invalid ledger record.",
        "COMMUNICATION_LEDGER_INCONSISTENT",
        500,
      );
    }

    return {
      reservationId: String(reservation.id),
      ledgerId: String(existingLedger.rows[0].id),
      alreadyCaptured: true,
    };
  }

  if (reservation.status !== "reserved") {
    throw billingError(
      "A released communication reservation cannot be charged.",
      "COMMUNICATION_RESERVATION_RELEASED",
      409,
    );
  }

  const walletResult = await client.query(
    `
      SELECT id, balance_kobo
      FROM business_wallets
      WHERE id = $1
        AND business_id = $2
      FOR UPDATE
    `,
    [reservation.wallet_id, message.business_id],
  );

  if (walletResult.rowCount !== 1) {
    throw billingError(
      "Beevo could not find the wallet for this communication reservation.",
      "COMMUNICATION_WALLET_NOT_FOUND",
      500,
    );
  }

  const wallet = walletResult.rows[0];
  const balance = BigInt(wallet.balance_kobo);
  const amount = BigInt(reservation.amount_kobo);

  if (balance < amount) {
    throw billingError(
      "The wallet balance is insufficient to capture this reservation.",
      "COMMUNICATION_CAPTURE_INSUFFICIENT_BALANCE",
      409,
    );
  }

  const newBalance = balance - amount;

  const walletUpdate = await client.query(
    `
      UPDATE business_wallets
      SET balance_kobo = $3,
          updated_at = NOW()
      WHERE id = $1
        AND business_id = $2
      RETURNING id
    `,
    [
      reservation.wallet_id,
      message.business_id,
      newBalance.toString(),
    ],
  );

  if (walletUpdate.rowCount !== 1) {
    throw new Error("Beevo could not update the business wallet.");
  }

  const ledgerResult = await client.query(
    `
      INSERT INTO wallet_transactions (
        wallet_id,
        business_id,
        transaction_type,
        amount_kobo,
        balance_after_kobo,
        reference,
        description,
        metadata,
        reservation_id
      )
      VALUES (
        $1, $2, 'debit', $3, $4, $5, $6, $7::JSONB, $8
      )
      RETURNING id
    `,
    [
      reservation.wallet_id,
      message.business_id,
      amount.toString(),
      newBalance.toString(),
      `BEEVO-COMM-${reservation.id}-${randomUUID()}`,
      `Communication charge: ${reservation.channel}`,
      JSON.stringify({
        source: "communication_billing",
        messageId: String(message.id),
        attemptNumber: Number(message.attempt_count),
        channel: reservation.channel,
        unitCount: Number(reservation.unit_count),
        unitRateKobo: String(reservation.unit_rate_kobo),
        reservationId: String(reservation.id),
      }),
      reservation.id,
    ],
  );

  const reservationUpdate = await client.query(
    `
      UPDATE wallet_reservations
      SET status = 'captured',
          captured_at = NOW()
      WHERE id = $1
        AND business_id = $2
        AND status = 'reserved'
      RETURNING id
    `,
    [reservation.id, message.business_id],
  );

  if (reservationUpdate.rowCount !== 1) {
    throw new Error("Beevo could not finalize the communication reservation.");
  }

  return {
    reservationId: String(reservation.id),
    ledgerId: String(ledgerResult.rows[0].id),
    alreadyCaptured: false,
  };
}

/**
 * Release only when the provider definitely rejected the request.
 * This function participates in the caller's transaction.
 */
export async function releaseCommunicationReservation(
  client,
  message,
) {
  const result = await client.query(
    `
      UPDATE wallet_reservations
      SET status = 'released',
          released_at = NOW()
      WHERE business_id = $1
        AND message_id = $2
        AND attempt_number = $3
        AND status = 'reserved'
      RETURNING id
    `,
    [
      message.business_id,
      message.id,
      message.attempt_count,
    ],
  );

  return result.rowCount === 1;
}
