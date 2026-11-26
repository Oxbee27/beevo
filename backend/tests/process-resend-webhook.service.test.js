import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import { processResendWebhookEvent } from "../src/services/process-resend-webhook.service.js";

const NEW_EVENT_TIME = "2030-01-03T10:00:00.000Z";

function createHarness({
  duplicate = false,
  existingEvent = {
    id: "1",
    provider_message_id: "resend-email-101",
    event_type: "email.delivered",
    event_created_at: NEW_EVENT_TIME,
    processing_result: "matched",
  },
  message = {
    id: "101",
    business_id: "7",
    status: "sent",
    provider_event_at: null,
    source_type: "follow_up",
    conversation_id: null,
    conversation_message_id: null,
  },
  failAttemptUpdate = false,
  failTimelineUpdate = false,
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

      if (normalized.startsWith("SELECT id, provider_message_id, event_type, event_created_at, processing_result FROM resend_webhook_events")) {
        return {
          rows: existingEvent ? [{ ...existingEvent }] : [],
          rowCount: existingEvent ? 1 : 0,
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

      if (normalized.startsWith("UPDATE conversation_messages")) {
        return {
          rows: failTimelineUpdate ? [] : [{ id: "701" }],
          rowCount: failTimelineUpdate ? 0 : 1,
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

  it("updates the conversation timeline when a conversation email is delivered", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "sent",
        provider_event_at: null,
        source_type: "conversation",
        conversation_id: "201",
        conversation_message_id: "701",
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_conversation_delivered_101",
      event: makeEvent("email.delivered"),
    });

    expect(result).toEqual({ status: "matched" });

    const timelineUpdate = calls.find(({ sql }) =>
      sql.startsWith("UPDATE conversation_messages")
    );

    expect(timelineUpdate).toBeDefined();
    expect(timelineUpdate.values).toEqual([
      "7",
      "201",
      "701",
      "delivered",
      "resend-email-101",
      new Date(NEW_EVENT_TIME),
    ]);
  });

  it("marks the conversation timeline as failed when a conversation email bounces", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "sent",
        provider_event_at: null,
        source_type: "conversation",
        conversation_id: "201",
        conversation_message_id: "701",
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_conversation_bounced_101",
      event: makeEvent("email.bounced"),
    });

    expect(result).toEqual({ status: "matched" });

    const timelineUpdate = calls.find(({ sql }) =>
      sql.startsWith("UPDATE conversation_messages")
    );

    expect(timelineUpdate).toBeDefined();
    expect(timelineUpdate.values[3]).toBe("failed");
    expect(timelineUpdate.values[4]).toBe("resend-email-101");
  });

  it("rolls back when the conversation timeline cannot be updated", async () => {
    const { calls } = createHarness({
      message: {
        id: "101",
        business_id: "7",
        status: "sent",
        provider_event_at: null,
        source_type: "conversation",
        conversation_id: "201",
        conversation_message_id: "701",
      },
      failTimelineUpdate: true,
    });

    await expect(processResendWebhookEvent({
      eventId: "evt_conversation_timeline_failure_101",
      event: makeEvent("email.delivered"),
    })).rejects.toThrow(
      "Could not update the Beevo email conversation timeline."
    );

    expect(calls.some(({ sql }) => sql === "ROLLBACK")).toBe(true);
    expect(calls.some(({ sql }) => sql === "COMMIT")).toBe(false);
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

  it("retries a previously unmatched event when its message becomes available", async () => {
    const { calls } = createHarness({
      duplicate: true,
      existingEvent: {
        id: "1",
        provider_message_id: "resend-email-101",
        event_type: "email.delivered",
        event_created_at: NEW_EVENT_TIME,
        processing_result: "unmatched",
      },
      message: {
        id: "101",
        business_id: "7",
        status: "sent",
        provider_event_at: null,
        source_type: "follow_up",
        conversation_id: null,
        conversation_message_id: null,
      },
    });

    const result = await processResendWebhookEvent({
      eventId: "evt_unmatched_retry_101",
      event: {
        type: "email.bounced",
        created_at: "2030-01-04T10:00:00.000Z",
        data: {
          email_id: "different-provider-id",
        },
      },
    });

    expect(result).toEqual({ status: "matched" });

    expect(
      calls.some(
        ({ sql, values }) =>
          sql.startsWith("SELECT id, business_id") &&
          values[0] === "resend-email-101"
      )
    ).toBe(true);

    expect(
      calls.some(
        ({ sql, values }) =>
          sql.startsWith("UPDATE follow_up_messages") &&
          values[2] === "delivered"
      )
    ).toBe(true);
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
