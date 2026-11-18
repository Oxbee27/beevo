import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const migration = readFileSync(
  new URL(
    "../src/database/migrations/013_wallet_ledger_consistency.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("Wallet ledger consistency migration", () => {
  it("requires timestamps for successful funding attempts", () => {
    expect(migration).toMatch(
      /status <> 'successful'[\s\S]*verified_at IS NOT NULL AND credited_at IS NOT NULL/i,
    );
    expect(migration).toMatch(
      /credited_at IS NULL[\s\S]*status = 'successful'/i,
    );
  });

  it("calculates wallet balances from credits and debits", () => {
    expect(migration).toMatch(/SUM\s*\([\s\S]*transaction_type = 'credit'/i);
    expect(migration).toMatch(/transaction_type = 'debit'/i);
    expect(migration).toMatch(/wallet_balance IS DISTINCT FROM ledger_balance/i);
  });

  it("checks consistency at transaction commit", () => {
    expect(migration).toMatch(
      /CREATE CONSTRAINT TRIGGER wallet_balance_matches_ledger[\s\S]*DEFERRABLE INITIALLY DEFERRED/i,
    );
    expect(migration).toMatch(
      /CREATE CONSTRAINT TRIGGER wallet_ledger_matches_balance[\s\S]*DEFERRABLE INITIALLY DEFERRED/i,
    );
  });
});
