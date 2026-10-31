import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import { createStaffSchema } from "../src/validators/create-staff.validator.js";
import { updateStaffSchema } from "../src/validators/update-staff.validator.js";
import { updateStaffStatusSchema } from "../src/validators/update-staff-status.validator.js";

const readSource = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

describe("Beevo staff management validation", () => {
  it("accepts valid staff creation data", () => {
    const result = createStaffSchema.safeParse({
      name: "Test Staff",
      email: "STAFF@EXAMPLE.COM",
      password: "ExamplePass123",
      roleId: "1",
    });

    expect(result.success).toBe(true);
    expect(result.data.email).toBe("staff@example.com");
  });

  it("allows staff creation without a custom role", () => {
    const result = createStaffSchema.safeParse({
      name: "Unassigned Staff",
      email: "unassigned@example.com",
      password: "ExamplePass123",
    });

    expect(result.success).toBe(true);
  });

  it("rejects client-controlled account roles", () => {
    const result = createStaffSchema.safeParse({
      name: "Test Staff",
      email: "staff@example.com",
      password: "ExamplePass123",
      role: "owner",
    });

    expect(result.success).toBe(false);
  });

  it("allows removing a staff member's custom role", () => {
    const result = updateStaffSchema.safeParse({
      roleId: null,
    });

    expect(result.success).toBe(true);
  });

  it("rejects empty staff updates", () => {
    const result = updateStaffSchema.safeParse({});

    expect(result.success).toBe(false);
  });

  it("accepts activation and deactivation status", () => {
    expect(
      updateStaffStatusSchema.safeParse({ isActive: false }).success
    ).toBe(true);

    expect(
      updateStaffStatusSchema.safeParse({ isActive: true }).success
    ).toBe(true);
  });

  it("rejects invalid staff status values", () => {
    expect(
      updateStaffStatusSchema.safeParse({ isActive: "false" }).success
    ).toBe(false);
  });
});

describe("Beevo staff management security", () => {
  it("protects staff routes with authentication and owner authorization", () => {
    const routes = readSource("routes/staff.routes.js");

    expect(routes).toContain("router.use(authenticateToken)");
    expect(routes).toContain("router.use(requireOwner)");
  });

  it("creates staff accounts as staff, never as owners", () => {
    const service = readSource("services/create-staff.service.js");

    expect(service).toContain("'staff'");
    expect(service).toContain("business_id");
    expect(service).toContain("bcrypt.hash");
  });

  it("checks that assigned roles belong to the same business", () => {
    const createService = readSource("services/create-staff.service.js");
    const updateService = readSource("services/update-staff.service.js");

    for (const service of [createService, updateService]) {
      expect(service).toMatch(/WHERE id = \$1\s+AND business_id = \$2/i);
    }
  });

  it("scopes staff reads and updates by business", () => {
    for (const name of [
      "list-staff",
      "get-staff",
      "update-staff",
      "update-staff-status",
    ]) {
      const service = readSource(`services/${name}.service.js`);

      expect(service, name).toMatch(/business_id\s*=/i);
      expect(service, name).toContain("'staff'");
    }
  });

  it("prevents inactive users from logging in", () => {
    const service = readSource("services/login.service.js");

    expect(service).toContain("!user.is_active");
  });

  it("checks account activation on authenticated requests", () => {
    const middleware = readSource("middleware/auth.middleware.js");

    expect(middleware).toContain("is_active");
    expect(middleware).toContain("payload.sub");
    expect(middleware).toContain("payload.businessId");
  });
});
