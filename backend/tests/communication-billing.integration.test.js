import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import pool from "../src/config/database.js";
import { reserveCommunicationFunds } from "../src/services/communication-billing.service.js";

const enabled = process.env.BEEVO_RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!enabled)(
  "Communication billing PostgreSQL integration",
  () => {
    let wallet;
    let originalRate;
    let fixture = {
      customerId: null,
      enquiryId: null,
      followUpId: null,
      messageIds: [],
    };

    beforeAll(async () => {
      const host = (process.env.DB_HOST || "").toLowerCase();

      if (
        process.env.DB_NAME !== "beevo_test" ||
        !["", "localhost", "127.0.0.1", "::1"].includes(host)
      ) {
        throw new Error(
          "Refusing integration tests: DB_NAME must be beevo and DB_HOST must be local."
        );
      }

      const connection = await pool.query(`
        SELECT
          current_database() AS database_name,
          host(inet_server_addr()) AS server_address
      `);

      if (
        connection.rows[0].database_name !== "beevo_test" ||
        ![null, "127.0.0.1", "::1"].includes(
          connection.rows[0].server_address
        )
      ) {
        throw new Error(
          "Refusing integration tests: PostgreSQL connection is not local beevo."
        );
      }

      const walletResult = await pool.query(`
        SELECT
          id,
          business_id,
          balance_kobo::TEXT AS balance_kobo,
          currency
        FROM business_wallets
        ORDER BY id
        LIMIT 1
      `);

      wallet = walletResult.rows[0];

      if (!wallet) {
        throw new Error("No existing wallet is available for integration tests.");
      }

      if (BigInt(wallet.balance_kobo) !== 0n) {
        throw new Error(
          "Refusing integration tests: selected wallet must have zero balance."
        );
      }

      const rateResult = await pool.query(`
        SELECT channel, unit_name, rate_kobo, enabled, updated_at
        FROM communication_channel_rates
        WHERE channel = 'email'
      `);

      originalRate = rateResult.rows[0];

      if (!originalRate) {
        throw new Error("The email communication rate row does not exist.");
      }

      // Save and temporarily configure the rate for this local test only.
      await pool.query(
        `UPDATE communication_channel_rates
         SET rate_kobo = 1,
             enabled = TRUE,
             updated_at = NOW()
         WHERE channel = 'email'`
      );

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const customer = await client.query(
          `INSERT INTO customers (business_id, name)
           VALUES ($1, $2)
           RETURNING id`,
          [wallet.business_id, "Beevo Billing Integration Fixture"]
        );

        fixture.customerId = customer.rows[0].id;

        const enquiry = await client.query(
          `INSERT INTO enquiries (business_id, customer_id, subject)
           VALUES ($1, $2, $3)
           RETURNING id`,
          [
            wallet.business_id,
            fixture.customerId,
            "Billing integration fixture",
          ]
        );

        fixture.enquiryId = enquiry.rows[0].id;

        const followUp = await client.query(
          `INSERT INTO follow_ups (
             business_id, enquiry_id, note, due_at
           )
           VALUES ($1, $2, $3, NOW())
           RETURNING id`,
          [
            wallet.business_id,
            fixture.enquiryId,
            "Disposable billing integration fixture",
          ]
        );

        fixture.followUpId = followUp.rows[0].id;

        for (let index = 0; index < 2; index += 1) {
          const message = await client.query(
            `INSERT INTO follow_up_messages (
               business_id,
               follow_up_id,
               enquiry_id,
               customer_id,
               channel,
               recipient,
               body,
               scheduled_for,
               next_attempt_at,
               attempt_count
             )
             VALUES ($1, $2, $3, $4, 'email', $5, $6, NOW(), NOW(), 1)
             RETURNING id`,
            [
              wallet.business_id,
              fixture.followUpId,
              fixture.enquiryId,
              fixture.customerId,
              `billing-fixture-${index}@example.test`,
              "Disposable billing integration message",
            ]
          );

          fixture.messageIds.push(message.rows[0].id);
        }

        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    });

    afterAll(async () => {
      try {
        const client = await pool.connect();

        try {
          await client.query("BEGIN");

          if (fixture.messageIds.length > 0) {
            await client.query(
              `DELETE FROM wallet_reservations
               WHERE business_id = $1
                 AND message_id = ANY($2::BIGINT[])`,
              [wallet.business_id, fixture.messageIds]
            );

            await client.query(
              `DELETE FROM follow_up_messages
               WHERE business_id = $1
                 AND id = ANY($2::BIGINT[])`,
              [wallet.business_id, fixture.messageIds]
            );
          }

          if (fixture.followUpId !== null) {
            await client.query(
              `DELETE FROM follow_ups
               WHERE business_id = $1 AND id = $2`,
              [wallet.business_id, fixture.followUpId]
            );
          }

          if (fixture.enquiryId !== null) {
            await client.query(
              `DELETE FROM enquiries
               WHERE business_id = $1 AND id = $2`,
              [wallet.business_id, fixture.enquiryId]
            );
          }

          if (fixture.customerId !== null) {
            await client.query(
              `DELETE FROM customers
               WHERE business_id = $1 AND id = $2`,
              [wallet.business_id, fixture.customerId]
            );
          }

          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK").catch(() => {});
          throw error;
        } finally {
          client.release();
        }
      } finally {
        try {
          if (originalRate) {
            await pool.query(
              `UPDATE communication_channel_rates
               SET unit_name = $2,
                   rate_kobo = $3,
                   enabled = $4,
                   updated_at = $5
               WHERE channel = $1`,
              [
                originalRate.channel,
                originalRate.unit_name,
                originalRate.rate_kobo,
                originalRate.enabled,
                originalRate.updated_at,
              ]
            );
          }
        } finally {
          await pool.end();
        }
      }
    });

    it("rejects a reservation when the real wallet has no available funds", async () => {
      const message = {
        id: fixture.messageIds[0],
        business_id: wallet.business_id,
        channel: "email",
        body: "Billing integration test",
        attempt_count: 1,
      };

      await expect(
        reserveCommunicationFunds(pool, message)
      ).rejects.toMatchObject({
        code: "INSUFFICIENT_COMMUNICATION_BALANCE",
        status: 402,
      });

      const result = await pool.query(
        `SELECT COUNT(*)::INT AS count
         FROM wallet_reservations
         WHERE business_id = $1 AND message_id = $2`,
        [wallet.business_id, message.id]
      );

      expect(result.rows[0].count).toBe(0);
    });

    it("prevents concurrent messages from creating unfunded reservations", async () => {
      const messages = fixture.messageIds.map((id) => ({
        id,
        business_id: wallet.business_id,
        channel: "email",
        body: "Concurrent billing integration test",
        attempt_count: 1,
      }));

      const results = await Promise.allSettled(
        messages.map((message) =>
          reserveCommunicationFunds(pool, message)
        )
      );

      expect(results).toHaveLength(2);

      for (const result of results) {
        expect(result.status).toBe("rejected");
        expect(result.reason).toMatchObject({
          code: "INSUFFICIENT_COMMUNICATION_BALANCE",
          status: 402,
        });
      }

      const reservations = await pool.query(
        `SELECT COUNT(*)::INT AS count
         FROM wallet_reservations
         WHERE business_id = $1
           AND message_id = ANY($2::BIGINT[])`,
        [wallet.business_id, fixture.messageIds]
      );

      expect(reservations.rows[0].count).toBe(0);

      const currentWallet = await pool.query(
        `SELECT balance_kobo::TEXT AS balance_kobo
         FROM business_wallets
         WHERE id = $1 AND business_id = $2`,
        [wallet.id, wallet.business_id]
      );

      expect(currentWallet.rows[0].balance_kobo).toBe(
        wallet.balance_kobo
      );
    });
  }
);
