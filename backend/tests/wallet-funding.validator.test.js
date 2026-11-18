import { describe, expect, it } from "vitest";
import { initializeWalletFundingSchema } from "../src/validators/wallet-funding.validator.js";

describe("wallet funding validation", () => {
  it("accepts a valid integer kobo amount and request key", () => {
    expect(
      initializeWalletFundingSchema.safeParse({
        amountKobo: "250000",
        idempotencyKey: "funding-request-123",
      }).success,
    ).toBe(true);
  });

  it.each([
    "0",
    "-100",
    "1.5",
    "00100",
    "abc",
    "9223372036854775808",
  ])("rejects invalid amount %s", (amountKobo) => {
    expect(
      initializeWalletFundingSchema.safeParse({
        amountKobo,
        idempotencyKey: "funding-request-123",
      }).success,
    ).toBe(false);
  });

  it("rejects a missing request key", () => {
    expect(
      initializeWalletFundingSchema.safeParse({
        amountKobo: "10000",
      }).success,
    ).toBe(false);
  });

  it("rejects unexpected fields", () => {
    expect(
      initializeWalletFundingSchema.safeParse({
        amountKobo: "10000",
        idempotencyKey: "funding-request-123",
        businessId: "999",
      }).success,
    ).toBe(false);
  });
});
