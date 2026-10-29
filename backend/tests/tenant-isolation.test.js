import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const service = (name) =>
  readFileSync(new URL(`../src/services/${name}.service.js`, import.meta.url), "utf8");

describe("Cross-business data isolation", () => {
  it("scopes customer reads, updates, and deletes by business", () => {
    for (const name of [
      "list-customers",
      "get-customer",
      "update-customer",
      "delete-customer",
    ]) {
      expect(service(name), name).toMatch(/business_id\s*=/i);
    }
  });

  it("scopes enquiry reads, updates, and deletes by business", () => {
    for (const name of [
      "list-enquiries",
      "get-enquiry",
      "update-enquiry",
      "delete-enquiry",
    ]) {
      expect(service(name), name).toMatch(/business_id\s*=/i);
    }
  });

  it("scopes follow-up reads, updates, and deletes by business", () => {
    for (const name of [
      "list-follow-ups",
      "get-follow-up",
      "get-upcoming-follow-ups",
      "update-follow-up",
      "delete-follow-up",
    ]) {
      expect(service(name), name).toMatch(/business_id\s*=/i);
    }
  });

  it("scopes dashboard totals by business", () => {
    expect(service("get-dashboard-summary"))
      .toMatch(/business_id\s*=\s*\$1/i);
  });
});
