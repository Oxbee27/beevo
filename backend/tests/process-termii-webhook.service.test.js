import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  processTermiiWebhookEvent,
  nextTermiiMessageStatus,
} from "../src/services/process-termii-webhook.service.js";

const fingerprint = "a".repeat(64);

function createHarness({
  duplicate = false,
  message = {
    id: "101",
    business_id: "7",
    status: "sent",
  },
  failAttemptUpdate = false,
} = {}) {
  const calls = [];

  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      calls.push({ sql: normalized, values });

      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        return { rows: [], rowCount: null };
      }

      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [], rowCount: null };
      }

      if (normalized.startsWith("INSERT INTO termii_webhook_events")) {
        return {
          rows: duplicate ? [] : [{ id: "1" }],
          rowCount: duplicate ? 0 : 1,
        };
      }

      if (normalized.startsWith("SELECT id, business_id, status")) {
        return {
          rows: message ? [{ ...message }] : [],
          rowCount: message ? 1 : 0,
        };
      }

      if (normalized.startsWith("UPDATE follow_up_messages")) {
        return { rows: [{ id: "101" }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE message_delivery_attempts")) {
        return {
          rows: failAttemptUpdate ? [] : [{ id: "501" }],
          rowCount: failAttemptUpdate ? 0 : 1,
        };
      }

      if (normalized.startsWith("UPDATE termii_webhook_events")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release: vi.fn(),
  };

  connect.mockResolvedValue(client);
  return { calls, client };
}

describe("Termii webhook event processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks an SMS delivered and updates its attempt", async () => {
    const { calls, client } = createHarness();

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Delivered" },
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE follow_up_messages") &&
      values[2] === "delivered"
    )).toBe(true);
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE message_delivery_attempts") &&
      values[2] === "sent"
    )).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("marks a failed SMS as failed", async () => {
    const { calls } = createHarness();

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Message Failed" },
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE follow_up_messages") &&
      values[2] === "failed"
    )).toBe(true);
  });

  it("does not downgrade a delivered message", async () => {
    const { calls } = createHarness({
      message: { id: "101", business_id: "7", status: "delivered" },
    });

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Message Failed" },
    });

    expect(result).toEqual({ status: "already_final" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("does not let a late Message Sent event undo a failure", async () => {
    const { calls } = createHarness({
      message: { id: "101", business_id: "7", status: "failed" },
    });

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Message Sent" },
    });

    expect(result).toEqual({ status: "already_final" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("records duplicate events without processing them twice", async () => {
    const { calls } = createHarness({ duplicate: true });

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Delivered" },
    });

    expect(result).toEqual({ status: "duplicate" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
  });

  it("records unmatched provider message IDs", async () => {
    createHarness({ message: null });

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "unknown-id", status: "Delivered" },
    });

    expect(result).toEqual({ status: "unmatched" });
  });

  it("ignores unsupported statuses", async () => {
    const { calls } = createHarness();

    const result = await processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Received" },
    });

    expect(result).toEqual({ status: "ignored" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
  });

  it("rolls back when the matching attempt cannot be updated", async () => {
    const { calls } = createHarness({ failAttemptUpdate: true });

    await expect(processTermiiWebhookEvent({
      eventFingerprint: fingerprint,
      event: { message_id: "termii-101", status: "Delivered" },
    })).rejects.toThrow("Could not update the matching Termii delivery attempt.");

    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });
});


describe("Termii reconciliation status progression", () => {
  it("keeps delivered final when a later failure event is reconciled", () => {
    let status = "sent";

    status = nextTermiiMessageStatus(status, "Delivered", "matched");
    expect(status).toBe("delivered");

    status = nextTermiiMessageStatus(status, "Message Failed", "already_final");
    expect(status).toBe("delivered");
  });

  it("allows a later delivery event to correct an earlier failure", () => {
    let status = "sent";

    status = nextTermiiMessageStatus(status, "Message Failed", "matched");
    expect(status).toBe("failed");

    status = nextTermiiMessageStatus(status, "Delivered", "matched");
    expect(status).toBe("delivered");
  });
});
