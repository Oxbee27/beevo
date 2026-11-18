import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pool from "../src/config/database.js";

const enabled = process.env.BEEVO_RUN_DB_INTEGRATION_TESTS === "true";

describe.skipIf(!enabled)("Wallet ledger PostgreSQL integration", () => {
  let client;
  let wallet;

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

    const result = await pool.query(`
      SELECT
        current_database() AS database_name,
        host(inet_server_addr()) AS server_address
    `);

    const connection = result.rows[0];

    if (
      connection.database_name !== "beevo_test" ||
      ![null, "127.0.0.1", "::1"].includes(connection.server_address)
    ) {
      throw new Error(
        "Refusing integration tests: PostgreSQL connection is not local beevo."
      );
    }

    const wallets = await pool.query(`
      SELECT id, business_id, balance_kobo
      FROM business_wallets
      ORDER BY id
      LIMIT 1
    `);

    if (wallets.rowCount !== 1) {
      throw new Error("No existing wallet is available for integration tests.");
    }
  });

  beforeEach(async () => {
    client = await pool.connect();
    await client.query("BEGIN");

    const result = await client.query(`
      SELECT id, business_id, balance_kobo
      FROM business_wallets
      ORDER BY id
      LIMIT 1
      FOR UPDATE
    `);

    wallet = result.rows[0];

    if (!wallet) {
      throw new Error("No wallet found for integration test.");
    }
  });

  afterEach(async () => {
    if (client) {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
        client = null;
      }
    }
  });

  afterAll(async () => {
    await pool.end();
  });

  it("rejects a wallet balance update without a matching ledger entry", async () => {
    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = balance_kobo + 1
       WHERE id = $1 AND business_id = $2`,
      [wallet.id, wallet.business_id]
    );

    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE")
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects a ledger credit without a matching wallet balance update", async () => {
    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id,
        business_id,
        transaction_type,
        amount_kobo,
        balance_after_kobo,
        reference,
        description
      )
      VALUES ($1, $2, 'credit', 1, $3, $4, 'Integration test')`,
      [
        wallet.id,
        wallet.business_id,
        Number(wallet.balance_kobo) + 1,
        `BEEVO-TEST-${randomUUID()}`,
      ]
    );

    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE")
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("accepts a matching wallet update and ledger credit in one transaction", async () => {
    const amount = 25;
    const nextBalance = BigInt(wallet.balance_kobo) + BigInt(amount);

    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = $1
       WHERE id = $2 AND business_id = $3`,
      [nextBalance.toString(), wallet.id, wallet.business_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id,
        business_id,
        transaction_type,
        amount_kobo,
        balance_after_kobo,
        reference,
        description
      )
      VALUES ($1, $2, 'credit', $3, $4, $5, 'Integration test credit')`,
      [
        wallet.id,
        wallet.business_id,
        amount,
        nextBalance.toString(),
        `BEEVO-TEST-${randomUUID()}`,
      ]
    );

    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE")
    ).resolves.toBeDefined();
  });

  it("rejects a successful payment attempt without verification timestamps", async () => {
    const inserted = await client.query(
      `INSERT INTO wallet_payment_attempts (
        business_id,
        reference,
        amount_kobo
      )
      VALUES ($1, $2, 100)
      RETURNING id`,
      [wallet.business_id, `BEEVO-TEST-${randomUUID()}`]
    );

    await expect(
      client.query(
        `UPDATE wallet_payment_attempts
         SET status = 'successful'
         WHERE id = $1`,
        [inserted.rows[0].id]
      )
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("serializes concurrent wallet row locks", async () => {
    const secondClient = await pool.connect();
    let secondTransactionOpen = false;

    try {
      await secondClient.query("BEGIN");
      secondTransactionOpen = true;

      let secondLockAcquired = false;

      const waitingLock = secondClient
        .query(
          `SELECT id
           FROM business_wallets
           WHERE id = $1
           FOR UPDATE`,
          [wallet.id]
        )
        .then(() => {
          secondLockAcquired = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(secondLockAcquired).toBe(false);

      await client.query("ROLLBACK");
      client.release();
      client = null;

      await waitingLock;

      expect(secondLockAcquired).toBe(true);
    } finally {
      if (secondTransactionOpen) {
        await secondClient.query("ROLLBACK");
      }

      secondClient.release();
    }
  });

  it("rejects a ledger entry with an incorrect historical balance", async () => {
    const amount = 25;
    const nextBalance = BigInt(wallet.balance_kobo) + BigInt(amount);

    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = $1
       WHERE id = $2 AND business_id = $3`,
      [nextBalance.toString(), wallet.id, wallet.business_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id,
        business_id,
        transaction_type,
        amount_kobo,
        balance_after_kobo,
        reference,
        description
      )
      VALUES ($1, $2, 'credit', $3, $4, $5, 'Incorrect running balance')`,
      [
        wallet.id,
        wallet.business_id,
        amount,
        (nextBalance + 1n).toString(),
        `BEEVO-TEST-${randomUUID()}`,
      ]
    );

    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE")
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("validates running balances for both credits and debits", async () => {
    const startingBalance = BigInt(wallet.balance_kobo);
    const creditedBalance = startingBalance + 10n;
    const finalBalance = creditedBalance - 4n;

    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = $1
       WHERE id = $2 AND business_id = $3`,
      [finalBalance.toString(), wallet.id, wallet.business_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, business_id, transaction_type,
        amount_kobo, balance_after_kobo, reference, description
      )
      VALUES ($1, $2, 'credit', 10, $3, $4, 'Integration credit')`,
      [
        wallet.id,
        wallet.business_id,
        creditedBalance.toString(),
        `BEEVO-TEST-${randomUUID()}`,
      ]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, business_id, transaction_type,
        amount_kobo, balance_after_kobo, reference, description
      )
      VALUES ($1, $2, 'debit', 4, $3, $4, 'Integration debit')`,
      [
        wallet.id,
        wallet.business_id,
        finalBalance.toString(),
        `BEEVO-TEST-${randomUUID()}`,
      ]
    );

    await expect(
      client.query("SET CONSTRAINTS ALL IMMEDIATE")
    ).resolves.toBeDefined();
  });

  it("prevents updating an existing ledger entry", async () => {
    const nextBalance = BigInt(wallet.balance_kobo) + 10n;
    const reference = `BEEVO-TEST-${randomUUID()}`;

    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = $1
       WHERE id = $2 AND business_id = $3`,
      [nextBalance.toString(), wallet.id, wallet.business_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, business_id, transaction_type,
        amount_kobo, balance_after_kobo, reference, description
      )
      VALUES ($1, $2, 'credit', 10, $3, $4, 'Immutable test')`,
      [wallet.id, wallet.business_id, nextBalance.toString(), reference]
    );

    await client.query("SET CONSTRAINTS ALL IMMEDIATE");

    await expect(
      client.query(
        `UPDATE wallet_transactions
         SET description = 'Tampered entry'
         WHERE reference = $1`,
        [reference]
      )
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("prevents deleting an existing ledger entry", async () => {
    const nextBalance = BigInt(wallet.balance_kobo) + 10n;
    const reference = `BEEVO-TEST-${randomUUID()}`;

    await client.query(
      `UPDATE business_wallets
       SET balance_kobo = $1
       WHERE id = $2 AND business_id = $3`,
      [nextBalance.toString(), wallet.id, wallet.business_id]
    );

    await client.query(
      `INSERT INTO wallet_transactions (
        wallet_id, business_id, transaction_type,
        amount_kobo, balance_after_kobo, reference, description
      )
      VALUES ($1, $2, 'credit', 10, $3, $4, 'Immutable test')`,
      [wallet.id, wallet.business_id, nextBalance.toString(), reference]
    );

    await client.query("SET CONSTRAINTS ALL IMMEDIATE");

    await expect(
      client.query(
        `DELETE FROM wallet_transactions WHERE reference = $1`,
        [reference]
      )
    ).rejects.toMatchObject({ code: "P0001" });
  });

});
