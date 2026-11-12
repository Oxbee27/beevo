import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("../src/config/database.js", () => ({
  default: {
    query: vi.fn(),
  },
}));

import pool from "../src/config/database.js";
import { requirePermission } from "../src/middleware/require-permission.middleware.js";

const makeResponse = () => {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  return res;
};

const makeRequest = (role = "staff") => ({
  user: {
    id: "12",
    businessId: "5",
    role,
  },
});

const readRoute = (name) =>
  readFileSync(new URL(`../src/routes/${name}`, import.meta.url), "utf8");

describe("requirePermission middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows staff with the requested permission", async () => {
    pool.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ role: "staff", has_permission: true }],
    });

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("conversations.view")(req, res, next);

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("u.business_id = $2"),
      ["12", "5", "conversations.view"]
    );
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects staff without the requested permission", async () => {
    pool.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ role: "staff", has_permission: false }],
    });

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("communications.edit")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        "You don't have access to this feature. Please contact your business owner.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("uses the current database role instead of the JWT role", async () => {
    pool.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ role: "staff", has_permission: false }],
    });

    const req = makeRequest("owner");
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("conversations.edit")(req, res, next);

    expect(req.user.role).toBe("staff");
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows owners without individual permission grants", async () => {
    pool.query.mockResolvedValue({
      rowCount: 1,
      rows: [{ role: "owner", has_permission: false }],
    });

    const req = makeRequest("staff");
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("communications.edit")(req, res, next);

    expect(req.user.role).toBe("owner");
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects accounts that no longer exist in the business", async () => {
    pool.query.mockResolvedValue({
      rowCount: 0,
      rows: [],
    });

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("conversations.view")(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message:
        "Your account is currently unavailable. Please contact your business owner.",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("passes unexpected database errors to the error handler", async () => {
    const error = new Error("Database unavailable");
    pool.query.mockRejectedValue(error);

    const req = makeRequest();
    const res = makeResponse();
    const next = vi.fn();

    await requirePermission("conversations.view")(req, res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe("conversation and communications route permissions", () => {
  it("protects conversation reads and classification with dedicated permissions", () => {
    const routes = readRoute("conversations.routes.js");

    expect(routes).toContain('requirePermission("conversations.view")');
    expect(routes).toContain('requirePermission("conversations.edit")');
  });

  it("protects communication reads and message actions with dedicated permissions", () => {
    const routes = readRoute("communications.routes.js");

    expect(routes).toContain('requirePermission("communications.view")');
    expect(routes).toContain('requirePermission("communications.edit")');
  });
});
