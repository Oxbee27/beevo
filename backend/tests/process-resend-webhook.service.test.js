import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import { processResendWebhookEvent } from "../src/services/process-resend-webhook.service.js";

const NEW_EVENT_TIME = "2030-01-03T10:00:00.000Z";

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

      if (normalized.startsWith("INSERT INTO resend_webhook_events")) {
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

      if (normalized.startsWith("UPDATE resend_webhook_events")) {
        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected SQL: ${normalized}`);
    },
    release: vi.fn(),
  };

  connect.mockResolvedValue(client);
  return { calls, client };
}

const makeEvent = (type, createdAt = NEW_EVENT_TIME) => ({
  type,
  created_at: createdAt,
  data: { email_id: "resend-email-101" },
});

describe("Resend webhook event processor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("updates the message and attempt when an email is delivered", async () => {
    const { calls, client } = createHarness();

    const result = await processResendWebhookEvent({
      eventId: "evt_delivered_101",
      event: makeEvent("email.delivered"),
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE follow_up_messages") &&
      values[2] === "delivered"
    )).toBe(true);
    expect(calls.some(({ sql }) =>
      sql.includes("UPDATE message_delivery_attempts")
    )).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("marks bounced messages and attempts as failed", async () => {
    const { calls } = createHarness();

    const result = await processResendWebhookEvent({
      eventId: "evt_bounced_101",
      event: makeEvent("email.bounced"),
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE follow_up_messages") &&
      values[2] === "failed"
    )).toBe(true);
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE message_delivery_attempts") &&
      values[2] === "failed"
    )).toBe(true);
  });

  it("allows a newer delivery event to correct an earlier failure", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "failed",
        provider_event_at: "2030-01-02T10:00:00.000Z",
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_later_delivery_101",
      event: makeEvent("email.delivered", "2030-01-03T10:00:00.000Z"),
    });

    expect(result).toEqual({ status: "matched" });
    expect(calls.some(({ sql, values }) =>
      sql.includes("UPDATE follow_up_messages") &&
      values[2] === "delivered" &&
      values[3] instanceof Date
    )).toBe(true);
  });

  it("ignores an older delivery event after a newer failure", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "failed",
        provider_event_at: "2030-01-04T10:00:00.000Z",
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_stale_delivery_101",
      event: makeEvent("email.delivered", "2030-01-03T10:00:00.000Z"),
    });

    expect(result).toEqual({ status: "stale" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE resend_webhook_events") &&
      values[1] === "stale"
    )).toBe(true);
  });

  it("never downgrades an already delivered message", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "delivered",
        provider_event_at: "2030-01-02T10:00:00.000Z",
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_late_bounce_101",
      event: makeEvent("email.bounced", "2030-01-03T10:00:00.000Z"),
    });

    expect(result).toEqual({ status: "already_final" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("UPDATE follow_up_messages")
    )).toBe(false);
  });

  it("ignores delivery events without a valid provider timestamp", async () => {
    const { calls } = createHarness();

    const result = await processResendWebhookEvent({
      eventId: "evt_without_timestamp_101",
      event: makeEvent("email.delivered", "invalid-timestamp"),
    });

    expect(result).toEqual({ status: "ignored" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id, status")
    )).toBe(false);
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE resend_webhook_events") &&
      values[1] === "ignored"
    )).toBe(true);
  });

  it("does not process a duplicate provider event twice", async () => {
    const { calls } = createHarness({ duplicate: true });

    const result = await processResendWebhookEvent({
      eventId: "evt_duplicate_101",
      event: makeEvent("email.delivered"),
    });

    expect(result).toEqual({ status: "duplicate" });
    expect(calls.some(({ sql }) =>
      sql.startsWith("SELECT id, business_id")
    )).toBe(false);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(true);
  });

  it("records an event when its provider message ID is unknown", async () => {
    const { calls } = createHarness({ message: null });

    const result = await processResendWebhookEvent({
      eventId: "evt_unmatched_101",
      event: makeEvent("email.delivered"),
    });

    expect(result).toEqual({ status: "unmatched" });
    expect(calls.some(({ sql, values }) =>
      sql.startsWith("UPDATE resend_webhook_events") &&
      values[1] === "unmatched"
    )).toBe(true);
  });

  it("rolls back if the matching delivery attempt cannot be updated", async () => {
    const { calls } = createHarness({ failAttemptUpdate: true });

    await expect(processResendWebhookEvent({
      eventId: "evt_attempt_failure_101",
      event: makeEvent("email.delivered"),
    })).rejects.toThrow("Could not update the matching delivery attempt.");

    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
  });
});
