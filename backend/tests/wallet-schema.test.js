import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../src/database/migrations/012_business_wallets_and_ledger.sql",
    import.meta.url
  ),
  "utf8"
);

describe("Business wallet database migration", () => {
  it("creates one wallet per business", () => {
    expect(migration).toMatch(
      /CREATE TABLE business_wallets/i
    );

    expect(migration).toMatch(
      /business_id BIGINT NOT NULL UNIQUE/i
    );
  });

  it("stores wallet balances as non-negative integer kobo", () => {
    expect(migration).toMatch(
      /balance_kobo BIGINT NOT NULL DEFAULT 0/i
    );

    expect(migration).toMatch(
      /CHECK\s*\(balance_kobo >= 0\)/i
    );

    expect(migration).toMatch(
      /currency CHAR\(3\) NOT NULL DEFAULT 'NGN'/i
    );
  });

  it("backfills existing businesses and creates wallets automatically", () => {
    expect(migration).toMatch(
      /INSERT INTO business_wallets\s*\(business_id\)\s*SELECT id\s*FROM businesses/i
    );

    expect(migration).toMatch(
      /CREATE TRIGGER businesses_create_wallet/i
    );
  });

  it("tracks payment attempts with unique references and idempotency keys", () => {
    expect(migration).toMatch(
      /CREATE TABLE wallet_payment_attempts/i
    );

    expect(migration).toMatch(
      /reference VARCHAR\(150\) NOT NULL UNIQUE/i
    );

    expect(migration).toMatch(
      /UNIQUE \(business_id, idempotency_key\)/i
    );

    expect(migration).toMatch(
      /status IN\s*\(\s*'pending',\s*'successful',\s*'failed',\s*'abandoned'/i
    );
  });

  it("prevents cross-business wallet and payment associations", () => {
    expect(migration).toMatch(
      /FOREIGN KEY \(wallet_id, business_id\)\s*REFERENCES business_wallets\(id, business_id\)/i
    );

    expect(migration).toMatch(
      /FOREIGN KEY \(payment_attempt_id, business_id\)\s*REFERENCES wallet_payment_attempts\(id, business_id\)/i
    );
  });

  it("prevents duplicate payment credits", () => {
    expect(migration).toMatch(
      /payment_attempt_id BIGINT UNIQUE/i
    );
  });

  it("creates an immutable transaction ledger", () => {
    expect(migration).toMatch(
      /CREATE TABLE wallet_transactions/i
    );

    expect(migration).toMatch(
      /CREATE TRIGGER wallet_transactions_immutable/i
    );

    expect(migration).toMatch(
      /BEFORE UPDATE OR DELETE ON wallet_transactions/i
    );
  });

  it("stores transaction amounts as positive integer kobo", () => {
    expect(migration).toMatch(
      /amount_kobo BIGINT NOT NULL\s*CHECK \(amount_kobo > 0\)/i
    );
  });
});
