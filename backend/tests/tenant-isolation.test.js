import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const service = (name) =>
  readFileSync(new URL(`../src/services/${name}.service.js`, import.meta.url), "utf8");

const route = (name) =>
  readFileSync(new URL(`../src/routes/${name}.routes.js`, import.meta.url), "utf8");

const scoped = (source, name) => {
  expect(source, name).toMatch(/business_id\s*=\s*\$1/i);
};

describe("Beevo tenant isolation", () => {
  describe("Customers", () => {
    it("scopes customer reads, updates and deletes", () => {
      for (const name of [
        "list-customers", "get-customer",
        "update-customer", "delete-customer",
      ]) scoped(service(name), name);
    });
  });

  describe("Enquiries", () => {
    it("scopes enquiry reads, updates and deletes", () => {
      for (const name of [
        "list-enquiries", "get-enquiry",
        "update-enquiry", "delete-enquiry",
      ]) scoped(service(name), name);
    });
  });

  describe("Follow-ups", () => {
    it("scopes follow-up reads, updates and deletes", () => {
      for (const name of [
        "list-follow-ups", "get-follow-up",
        "get-upcoming-follow-ups",
        "update-follow-up", "delete-follow-up",
      ]) scoped(service(name), name);
    });
  });

  describe("Products and product interests", () => {
    it("scopes product listing, retrieval, updates and archiving", () => {
      const source = service("product");
      for (const pattern of [
        /WHERE business_id = \$1/i,
        /WHERE business_id = \$1 AND id = \$2/i,
      ]) expect(source).toMatch(pattern);
    });

    it("scopes product-interest creation, listing and updates", () => {
      const source = service("product-interest");
      expect(source).toMatch(/business_id\s*=\s*\$1/i);
      expect(source).toMatch(/pi\.business_id\s*=\s*\$1/i);
      expect(source).toMatch(/business_id,\s*product_id,\s*customer_id/i);
    });
  });

  describe("Conversations and messages", () => {
    it("scopes conversation listing and retrieval", () => {
      const source = service("list-business-conversations");
      expect(source).toMatch(/c\.business_id\s*=\s*\$1/i);
      expect(source).toMatch(/cm\.business_id\s*=\s*c\.business_id/i);
    });

    it("scopes the pending conversation inbox and its messages", () => {
      const source = service("pending-conversation-inbox");
      expect(source).toMatch(/c\.business_id\s*=\s*\$1/i);
      expect(source).toMatch(/business_id\s*=\s*\$1\s+AND\s+conversation_id\s*=\s*\$2/i);
    });

    it("scopes conversation classification and message operations", () => {
      const source = service("classify-business-conversation");
      expect(source).toMatch(/business_id\s*=\s*\$1/i);
      expect(source).toMatch(/business_id\s*=\s*\$1\s+AND\s+conversation_id\s*=\s*\$2/i);
    });
  });

  describe("Wallet and transactions", () => {
    it("scopes wallet balance reads", () => {
      scoped(service("get-business-wallet"), "wallet balance");
    });

    it("scopes transaction history and counts", () => {
      const source = service("list-wallet-transactions");
      expect(source).toMatch(/FROM wallet_transactions\s+WHERE business_id = \$1/i);
      expect(source).toMatch(/LIMIT \$2/i);
      expect(source).toMatch(/OFFSET \$3/i);
    });

    it("restricts wallet routes to authenticated owners", () => {
      const source = route("wallet");
      expect(source).toMatch(/router\.use\(authenticateToken\)/);
      expect(source).toMatch(/router\.use\(requireOwner\)/);
    });
  });

  describe("Staff and roles", () => {
    it("scopes staff listing and retrieval", () => {
      scoped(service("list-staff"), "staff listing");
      expect(service("get-staff")).toMatch(/u\.business_id\s*=\s*\$2/i);
    });

    it("scopes staff updates and status changes", () => {
      expect(service("update-staff")).toMatch(/business_id\s*=\s*\$8/i);
      expect(service("update-staff-status")).toMatch(/business_id\s*=\s*\$3/i);
    });

    it("restricts staff and role management routes to owners", () => {
      expect(route("staff")).toMatch(/router\.use\(requireOwner\)/);
      expect(route("role")).toMatch(/router\.use\(requireOwner\)/);
    });

    it("scopes role listing, updating and deletion", () => {
      for (const name of ["list-roles", "update-role", "delete-role"]) {
        expect(service(name), name).toMatch(/business_id\s*=\s*\$\d+/i);
      }
    });
  });

  describe("Dashboard", () => {
    it("scopes dashboard totals to the authenticated business", () => {
      expect(service("get-dashboard-summary"))
        .toMatch(/business_id\s*=\s*\$1/i);
    });
  });
});
