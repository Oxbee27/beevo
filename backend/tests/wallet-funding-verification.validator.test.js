import { describe, expect, it } from "vitest";
import { verifyWalletFundingSchema } from "../src/validators/wallet-funding-verification.validator.js";

describe("Beevo wallet funding verification validator", () => {
  it("accepts a valid payment reference", () => {
    expect(verifyWalletFundingSchema.safeParse({
      reference: "BEEVO-12345678-1234-1234-1234-123456789abc",
    }).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    const result = verifyWalletFundingSchema.safeParse({
      reference: "  BEEVO-12345678  ",
    });

    expect(result.success).toBe(true);
    expect(result.data.reference).toBe("BEEVO-12345678");
  });

  it.each([
    "",
    "short",
    "reference with spaces",
    "<script>",
    "a".repeat(151),
  ])("rejects invalid reference %s", (reference) => {
    expect(
      verifyWalletFundingSchema.safeParse({ reference }).success,
    ).toBe(false);
  });

  it("rejects client-supplied amount and business ID", () => {
    expect(verifyWalletFundingSchema.safeParse({
      reference: "BEEVO-12345678",
      amountKobo: "999999",
      businessId: "999",
    }).success).toBe(false);
  });

  it("rejects a missing reference", () => {
    expect(verifyWalletFundingSchema.safeParse({}).success).toBe(false);
  });
});
