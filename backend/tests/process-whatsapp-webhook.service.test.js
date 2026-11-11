import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({
  connect: vi.fn(),
}));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  processWhatsAppWebhookEvent,
} from "../src/services/process-whatsapp-webhook.service.js";

const fingerprint = "b".repeat(64);

function createHarness({
  duplicate = false,
  message = {
    id: "101",
    business_id: "7",
    status: "sent",
    provider_event_at: null,
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

      if (normalized.startsWith("INSERT INTO whatsapp_webhook_events")) {
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

      if (normalized.startsWith("UPDATE whatsapp_webhook_events")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release: vi.fn(),
  };

  connect.mockResolvedValue(client);
  return { calls, client };
}

function event(status = "delivered", timestamp = "1794400000") {
  return {
    id: "wamid.test-101",
    status,
    timestamp,
    errors: [],
  };
}

describe("WhatsApp webhook event processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("marks a WhatsApp message delivered and updates its attempt", async () => {
    const { calls, client } = createHarness();

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("delivered"),
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE follow_up_messages") &&
      values[2] === "delivered"
    )).toBe(true);
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE message_delivery_attempts") &&
      values[2] === "sent"
    )).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("maps a read event to delivered", async () => {
    const { calls } = createHarness();

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("read"),
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE follow_up_messages") &&
      values[2] === "delivered"
    )).toBe(true);
  });

  it("marks a failed WhatsApp message as failed", async () => {
    const { calls } = createHarness();

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: {
        ...event("failed"),
        errors: [{ title: "Delivery failed", message: "Test failure" }],
      },
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE follow_up_messages") &&
      values[2] === "failed"
    )).toBe(true);
  });

  it("does not downgrade a delivered message", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "delivered",
        provider_event_at: null,
      },
    });

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("failed"),
    });

    expect(result).toEqual({ status: "already_final" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("does not let a late sent event undo a failure", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "failed",
        provider_event_at: null,
      },
    });

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("sent"),
    });

    expect(result).toEqual({ status: "already_final" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("rejects an older provider event as stale", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "sent",
        provider_event_at: new Date(1794401000000),
      },
    });

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("delivered", "1794400000"),
    });

    expect(result).toEqual({ status: "stale" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("records duplicate events without processing them twice", async () => {
    const { calls } = createHarness({ duplicate: true });

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event(),
    });

    expect(result).toEqual({ status: "duplicate" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
  });

  it("records unmatched provider message IDs", async () => {
    createHarness({ message: null });

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event(),
    });

    expect(result).toEqual({ status: "unmatched" });
  });

  it("ignores unsupported statuses", async () => {
    const { calls } = createHarness();

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("read_receipt"),
    });

    expect(result).toEqual({ status: "ignored" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
  });

  it("ignores events without a valid timestamp", async () => {
    const { calls } = createHarness();

    const result = await processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event("delivered", "invalid"),
    });

    expect(result).toEqual({ status: "ignored" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
  });

  it("rolls back when the matching attempt cannot be updated", async () => {
    const { calls } = createHarness({ failAttemptUpdate: true });

    await expect(processWhatsAppWebhookEvent({
      eventFingerprint: fingerprint,
      event: event(),
    })).rejects.toThrow(
      "Could not update the matching WhatsApp delivery attempt.",
    );

    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });
});
