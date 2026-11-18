import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const service = (name) =>
  readFileSync(
    new URL(`../src/services/${name}.service.js`, import.meta.url),
    "utf8"
  );

describe("Wallet tenant isolation", () => {
  it("scopes wallet balance reads to the authenticated business", () => {
    expect(service("get-business-wallet"))
      .toMatch(/WHERE business_id = \$1/i);
  });

  it("scopes transaction history to the authenticated business", () => {
    expect(service("list-wallet-transactions"))
      .toMatch(/WHERE business_id = \$1/i);
  });

  it("scopes transaction counts to the authenticated business", () => {
    const source = service("list-wallet-transactions");

    expect(source).toMatch(
      /SELECT COUNT\(\*\)::BIGINT AS total\s+FROM wallet_transactions\s+WHERE business_id = \$1/i
    );
  });

  it("uses parameterized pagination", () => {
    const source = service("list-wallet-transactions");

    expect(source).toMatch(/LIMIT \$2/i);
    expect(source).toMatch(/OFFSET \$3/i);
  });

  it("restricts wallet routes to authenticated business owners", () => {
    const routes = readFileSync(
      new URL("../src/routes/wallet.routes.js", import.meta.url),
      "utf8"
    );

    expect(routes).toMatch(/router\.use\(authenticateToken\)/);
    expect(routes).toMatch(/router\.use\(requireOwner\)/);
  });
});
