import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  consumeMetaEmbeddedSignupState,
  createMetaEmbeddedSignupState,
} from "../src/services/meta-embedded-signup-state.service.js";

describe("Meta embedded signup state service", () => {
  let db;

  beforeEach(() => {
    db = { query: vi.fn() };
  });

  describe("createMetaEmbeddedSignupState", () => {
    it("rejects invalid business or user IDs without querying the database", async () => {
      await expect(createMetaEmbeddedSignupState(0, 7, db))
        .rejects.toThrow("A valid business ID is required.");

      await expect(createMetaEmbeddedSignupState(12, null, db))
        .rejects.toThrow("A valid user ID is required.");

      expect(db.query).not.toHaveBeenCalled();
    });

    it("creates a random state and stores only its SHA-256 hash", async () => {
      db.query.mockResolvedValue({
        rows: [{ expires_at: "2026-11-23T12:10:00.000Z" }],
      });

      const result = await createMetaEmbeddedSignupState(12, 7, db);

      expect(result.state).toMatch(/^[a-f0-9]{64}$/);
      expect(result.expiresAt).toBe("2026-11-23T12:10:00.000Z");

      const [sql, params] = db.query.mock.calls[0];
      const expectedHash = createHash("sha256")
        .update(result.state)
        .digest("hex");

      expect(sql).toContain("meta_embedded_signup_states");
      expect(sql).toContain("role = 'owner'");
      expect(sql).toContain("INTERVAL '10 minutes'");
      expect(params).toEqual([expectedHash, "12", "7"]);
      expect(params).not.toContain(result.state);
    });

    it("rejects a user who is not an owner in the specified business", async () => {
      db.query.mockResolvedValue({ rows: [] });

      await expect(createMetaEmbeddedSignupState(12, 7, db))
        .rejects.toThrow("Business owner account could not be verified.");
    });
  });

  describe("consumeMetaEmbeddedSignupState", () => {
    const state = "a".repeat(64);

    it("rejects malformed state without querying the database", async () => {
      const result = await consumeMetaEmbeddedSignupState("invalid", 12, 7, db);

      expect(result).toBeNull();
      expect(db.query).not.toHaveBeenCalled();
    });

    it("rejects invalid tenant IDs", async () => {
      await expect(consumeMetaEmbeddedSignupState(state, 0, 7, db))
        .rejects.toThrow("A valid business ID is required.");

      expect(db.query).not.toHaveBeenCalled();
    });

    it("consumes a state only for its matching business and user", async () => {
      db.query.mockResolvedValue({
        rows: [{
          business_id: "12",
          user_id: "7",
          consumed_at: "2026-11-23T12:05:00.000Z",
        }],
      });

      const result = await consumeMetaEmbeddedSignupState(state, 12, 7, db);

      expect(result).toMatchObject({
        businessId: "12",
        userId: "7",
      });

      const [sql, params] = db.query.mock.calls[0];

      expect(sql).toContain("consumed_at IS NULL");
      expect(sql).toContain("expires_at > NOW()");
      expect(params).toEqual([
        createHash("sha256").update(state).digest("hex"),
        "12",
        "7",
      ]);
      expect(params).not.toContain(state);
    });

    it("rejects a state when the user is no longer a business owner", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await consumeMetaEmbeddedSignupState(state, 12, 7, db);

      expect(result).toBeNull();

      const [sql, params] = db.query.mock.calls[0];

      expect(sql).toContain("EXISTS");
      expect(sql).toContain("FROM users u");
      expect(sql).toContain("u.role = 'owner'");
      expect(sql).toContain("u.business_id = $2");
      expect(params).toEqual([
        createHash("sha256").update(state).digest("hex"),
        "12",
        "7",
      ]);
    });

    it("returns null when the state is expired, replayed, or belongs to another tenant", async () => {
      db.query.mockResolvedValue({ rows: [] });

      const result = await consumeMetaEmbeddedSignupState(state, 99, 7, db);

      expect(result).toBeNull();
      expect(db.query).toHaveBeenCalledOnce();
    });
  });
});
