import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import pool from "../src/config/database.js";
import {
  captureCommunicationReservation,
  reserveCommunicationFunds,
} from "../src/services/communication-billing.service.js";

const enabled =
  process.env.BEEVO_RUN_DB_INTEGRATION_TESTS === "true" &&
  process.env.DB_NAME === "beevo_test";

async function createFixture(creditKobo) {
  const suffix = randomUUID();

  const businessResult = await pool.query(
    `
      INSERT INTO businesses (name, email)
      VALUES ($1, $2)
      RETURNING id
    `,
    [`Billing integration ${suffix}`, `billing-${suffix}@example.test`],
  );

  const businessId = businessResult.rows[0].id;

  const walletResult = await pool.query(
    `
      SELECT id, balance_kobo
      FROM business_wallets
      WHERE business_id = $1
    `,
    [businessId],
  );

  expect(walletResult.rowCount).toBe(1);

  const wallet = walletResult.rows[0];

  if (creditKobo > 0) {
    await creditWallet(businessId, wallet.id, creditKobo);
  }

  const customerResult = await pool.query(
    `
      INSERT INTO customers (business_id, name, email)
      VALUES ($1, $2, $3)
      RETURNING id
    `,
    [businessId, "Billing Test Customer", `customer-${suffix}@example.test`],
  );

  const customerId = customerResult.rows[0].id;

  const enquiryResult = await pool.query(
    `
      INSERT INTO enquiries (
        business_id,
        customer_id,
        subject,
        description
      )
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [businessId, customerId, "Billing integration enquiry", "Test enquiry"],
  );

  const enquiryId = enquiryResult.rows[0].id;

  const followUpResult = await pool.query(
    `
      INSERT INTO follow_ups (
        business_id,
        enquiry_id,
        note,
        due_at
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '1 hour')
      RETURNING id
    `,
    [businessId, enquiryId, "Billing integration follow-up"],
  );

  return {
    businessId,
    walletId: wallet.id,
    enquiryId,
    customerId,
    followUpId: followUpResult.rows[0].id,
  };
}

async function creditWallet(businessId, walletId, amountKobo) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const walletResult = await client.query(
      `
        SELECT balance_kobo
        FROM business_wallets
        WHERE id = $1
          AND business_id = $2
        FOR UPDATE
      `,
      [walletId, businessId],
    );

    expect(walletResult.rowCount).toBe(1);

    const newBalance =
      BigInt(walletResult.rows[0].balance_kobo) + BigInt(amountKobo);

    await client.query(
      `
        UPDATE business_wallets
        SET balance_kobo = $3,
            updated_at = NOW()
        WHERE id = $1
          AND business_id = $2
      `,
      [walletId, businessId, newBalance.toString()],
    );

    await client.query(
      `
        INSERT INTO wallet_transactions (
          wallet_id,
          business_id,
          transaction_type,
          amount_kobo,
          balance_after_kobo,
          reference,
          description,
          metadata
        )
        VALUES ($1, $2, 'credit', $3, $4, $5, $6, $7::JSONB)
      `,
      [
        walletId,
        businessId,
        String(amountKobo),
        newBalance.toString(),
        `BEEVO-TEST-CREDIT-${randomUUID()}`,
        "Disposable integration-test funding",
        JSON.stringify({ source: "funded_billing_integration_test" }),
      ],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function createMessage(fixture) {
  const result = await pool.query(
    `
      INSERT INTO follow_up_messages (
        business_id,
        follow_up_id,
        enquiry_id,
        customer_id,
        channel,
        recipient,
        subject,
        body,
        scheduled_for,
        next_attempt_at,
        attempt_count
      )
      VALUES (
        $1, $2, $3, $4,
        'email',
        'recipient@example.test',
        'Billing integration test',
        'Test communication billing',
        NOW(),
        NOW(),
        1
      )
      RETURNING id, business_id, attempt_count, channel, body
    `,
    [
      fixture.businessId,
      fixture.followUpId,
      fixture.enquiryId,
      fixture.customerId,
    ],
  );

  return result.rows[0];
}

describe.skipIf(!enabled)(
  "Funded communication billing database integration",
  () => {
    beforeAll(async () => {
      const host = (process.env.DB_HOST || "").toLowerCase();

      expect(["localhost", "127.0.0.1", "::1"]).toContain(host);

      const identity = await pool.query(`
        SELECT
          current_database() AS database_name,
          inet_server_addr()::text AS server_address
      `);

      expect(identity.rows[0].database_name).toBe("beevo_test");
      expect(["127.0.0.1", "::1"]).toContain(
        identity.rows[0].server_address?.split("/")[0],
      );

      const rateResult = await pool.query(`
        UPDATE communication_channel_rates
        SET rate_kobo = 1,
            enabled = TRUE
        WHERE channel = 'email'
        RETURNING channel, unit_name, rate_kobo, enabled
      `);

      expect(rateResult.rowCount).toBe(1);
      expect(rateResult.rows[0].unit_name).toBe("message");
      expect(Number(rateResult.rows[0].rate_kobo)).toBe(1);
      expect(rateResult.rows[0].enabled).toBe(true);
    });

    afterAll(async () => {
      await pool.end();
    });

    it("prevents concurrent reservations from overspending the wallet and captures only once", async () => {
      const fixture = await createFixture(1);
      const firstMessage = await createMessage(fixture);
      const secondMessage = await createMessage(fixture);

      const outcomes = await Promise.allSettled([
        reserveCommunicationFunds(pool, firstMessage),
        reserveCommunicationFunds(pool, secondMessage),
      ]);

      const successful = outcomes.filter(
        (outcome) => outcome.status === "fulfilled",
      );

      const rejected = outcomes.filter(
        (outcome) => outcome.status === "rejected",
      );

      expect(successful).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason.code).toBe(
        "INSUFFICIENT_COMMUNICATION_BALANCE",
      );

      const reservations = await pool.query(
        `
          SELECT id, message_id, amount_kobo, status
          FROM wallet_reservations
          WHERE business_id = $1
          ORDER BY id
        `,
        [fixture.businessId],
      );

      expect(reservations.rowCount).toBe(1);
      expect(reservations.rows[0].status).toBe("reserved");
      expect(reservations.rows[0].amount_kobo).toBe("1");

      const winningMessage =
        successful[0] === outcomes[0] ? firstMessage : secondMessage;

      const client = await pool.connect();
      let captured;

      try {
        await client.query("BEGIN");
        captured = await captureCommunicationReservation(
          client,
          winningMessage,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }

      expect(captured.alreadyCaptured).toBe(false);

      const retryClient = await pool.connect();
      let repeatedCapture;

      try {
        await retryClient.query("BEGIN");
        repeatedCapture = await captureCommunicationReservation(
          retryClient,
          winningMessage,
        );
        await retryClient.query("COMMIT");
      } catch (error) {
        await retryClient.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        retryClient.release();
      }

      expect(repeatedCapture.alreadyCaptured).toBe(true);
      expect(repeatedCapture.ledgerId).toBe(captured.ledgerId);
      expect(repeatedCapture.reservationId).toBe(captured.reservationId);

      const finalState = await pool.query(
        `
          SELECT
            w.balance_kobo,
            r.status AS reservation_status,
            COUNT(t.id)::INTEGER AS debit_count
          FROM business_wallets w
          JOIN wallet_reservations r
            ON r.wallet_id = w.id
           AND r.business_id = w.business_id
          LEFT JOIN wallet_transactions t
            ON t.reservation_id = r.id
           AND t.business_id = r.business_id
           AND t.transaction_type = 'debit'
          WHERE w.business_id = $1
            AND r.id = $2
          GROUP BY w.balance_kobo, r.status
        `,
        [fixture.businessId, captured.reservationId],
      );

      expect(finalState.rowCount).toBe(1);
      expect(finalState.rows[0].balance_kobo).toBe("0");
      expect(finalState.rows[0].reservation_status).toBe("captured");
      expect(finalState.rows[0].debit_count).toBe(1);
    });

    it("rolls back wallet debit, ledger insertion and reservation capture together", async () => {
      const fixture = await createFixture(1);
      const message = await createMessage(fixture);

      const reservation = await reserveCommunicationFunds(pool, message);

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const capture = await captureCommunicationReservation(
          client,
          message,
        );

        expect(capture.alreadyCaptured).toBe(false);

        // Simulate a later failure in the caller's transaction.
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }

      const state = await pool.query(
        `
          SELECT
            w.balance_kobo,
            r.status AS reservation_status,
            COUNT(t.id)::INTEGER AS debit_count
          FROM business_wallets w
          JOIN wallet_reservations r
            ON r.wallet_id = w.id
           AND r.business_id = w.business_id
          LEFT JOIN wallet_transactions t
            ON t.reservation_id = r.id
           AND t.business_id = r.business_id
           AND t.transaction_type = 'debit'
          WHERE w.business_id = $1
            AND r.id = $2
          GROUP BY w.balance_kobo, r.status
        `,
        [fixture.businessId, reservation.reservationId],
      );

      expect(state.rowCount).toBe(1);
      expect(state.rows[0].balance_kobo).toBe("1");
      expect(state.rows[0].reservation_status).toBe("reserved");
      expect(state.rows[0].debit_count).toBe(0);
    });
  },
);
