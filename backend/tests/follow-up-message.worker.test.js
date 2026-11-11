import { describe, it, expect, vi } from "vitest";
import { processDueFollowUpMessages } from "../src/workers/follow-up-message.worker.js";

function createHarness({
  eligibleAfterClaim = true,
  failSuccessPersistence = false,
  failAttemptUpdate = false,
  noDueMessages = false,
  channel = "email",
  whatsappEvents = [],
} = {}) {
  const message = {
    id: "101",
    business_id: "7",
    follow_up_id: "4",
    customer_id: "6",
    channel,
    recipient: ["sms", "whatsapp"].includes(channel)
      ? "+2348012345678"
      : "customer@example.com",
    subject: channel === "email" ? "Checking in" : null,
    body: "Thank you for your enquiry.",
    template_key: channel === "whatsapp" ? "hello_world" : null,
    attempt_count: 0,
    max_attempts: 5,
    status: "pending",
  };

  const state = {
    message: { ...message },
    attemptStatus: null,
    whatsappEvents: whatsappEvents.map((event) => ({ ...event })),
    queries: [],
  };

  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push(normalized);

      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
        return { rows: [], rowCount: null };
      }

      if (
        normalized.startsWith("SELECT pg_advisory_xact_lock")
      ) {
        return { rows: [], rowCount: null };
      }

      if (normalized.startsWith("SELECT id, event_status, provider_event_at")) {
        return {
          rows: state.whatsappEvents.filter(
            (event) => event.processing_result === "unmatched",
          ),
          rowCount: state.whatsappEvents.length,
        };
      }

      if (normalized.startsWith("SELECT id, event_status")) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("UPDATE whatsapp_webhook_events")) {
        const event = state.whatsappEvents.find(
          (item) => String(item.id) === String(values[0]),
        );
        if (event) event.processing_result = values[1];
        return { rows: [], rowCount: event ? 1 : 0 };
      }

      if (normalized.startsWith("UPDATE termii_webhook_events")) {
        return { rows: [], rowCount: 1 };
      }

      if (normalized.includes("UPDATE message_delivery_attempts a")) {
        return { rows: [], rowCount: 0 };
      }

      if (
        normalized.includes("UPDATE follow_up_messages") &&
        normalized.includes("INTERVAL '10 minutes'")
      ) {
        return { rows: [], rowCount: 0 };
      }

      if (
        normalized.includes("UPDATE follow_up_messages m") &&
        normalized.includes("consent_status = 'granted'")
      ) {
        return { rows: [], rowCount: 0 };
      }

      if (
        normalized.includes("UPDATE follow_up_messages m") &&
        normalized.includes("f.status <> 'pending'")
      ) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("SELECT m.* FROM follow_up_messages")) {
        return {
          rows: noDueMessages
            ? []
            : [{ ...state.message }],
          rowCount: noDueMessages ? 0 : 1,
        };
      }

      if (normalized.includes("attempt_count = attempt_count + 1")) {
        state.message = {
          ...state.message,
          status: "processing",
          attempt_count: state.message.attempt_count + 1,
          locked_by: values[2],
        };

        return {
          rows: [{ ...state.message }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("INSERT INTO message_delivery_attempts")) {
        state.attemptStatus = "processing";
        return { rows: [], rowCount: 1 };
      }

      if (
        normalized.startsWith("UPDATE follow_up_messages") &&
        normalized.includes("SET status = $3")
      ) {
        state.message.status = values[2];
        state.message.provider_event_at = values[3];
        return { rows: [{ id: state.message.id }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE follow_up_messages")) {
        if (normalized.includes("SET status = 'unknown'")) {
          state.message.status = "unknown";
          state.message.locked_by = null;
          return { rows: [{ id: state.message.id }], rowCount: 1 };
        }

        if (normalized.includes("SET status = 'sent'")) {
          if (failSuccessPersistence) {
            throw new Error("Simulated database persistence failure.");
          }

          state.message.status = "sent";
          state.message.provider_message_id = values[4];

          return { rows: [{ id: state.message.id }], rowCount: 1 };
        }

        if (normalized.includes("SET status = 'cancelled'")) {
          state.message.status = "cancelled";
          state.message.locked_by = null;
          return { rows: [{ id: state.message.id }], rowCount: 1 };
        }

        if (normalized.includes("SET status = CASE")) {
          state.message.status =
            state.message.attempt_count >= state.message.max_attempts
              ? "failed"
              : "pending";

          return { rows: [{ id: state.message.id }], rowCount: 1 };
        }
      }

      if (
        normalized.startsWith("UPDATE message_delivery_attempts") &&
        normalized.includes("SET status = $3")
      ) {
        state.attemptStatus = values[2];
        return { rows: [{ id: "attempt-101" }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE message_delivery_attempts")) {
        if (normalized.includes("SET status = 'sent'")) {
          state.attemptStatus = "sent";
        } else if (normalized.includes("SET status = 'failed'")) {
          state.attemptStatus = "failed";
        } else if (normalized.includes("SET status = 'unknown'")) {
          state.attemptStatus = "unknown";
        }

        return { rows: [], rowCount: failAttemptUpdate ? 0 : 1 };
      }

      throw new Error(`Unexpected test SQL: ${normalized}`);
    },

    release: vi.fn(),
  };

  const db = {
    connect: vi.fn(async () => client),

    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push(normalized);

      if (
        normalized.startsWith("UPDATE follow_up_messages") &&
        normalized.includes("ANY($2)")
      ) {
        return { rows: (values[1] || []).map((id) => ({ id })), rowCount: (values[1] || []).length };
      }

      if (normalized.includes("SELECT 1 FROM follow_ups")) {
        return {
          rows: eligibleAfterClaim ? [{ "?column?": 1 }] : [],
          rowCount: eligibleAfterClaim ? 1 : 0,
        };
      }

      throw new Error(`Unexpected pool SQL: ${normalized}`);
    },
  };

  return { db, state };
}

describe("Beevo scheduled-message worker", () => {
  it("sends an eligible SMS through Termii and records its provider message ID", async () => {
    const { db, state } = createHarness({ channel: "sms" });

    const sendSms = vi.fn().mockResolvedValue({
      provider: "termii",
      providerMessageId: "termii-test-101",
    });
    const sendEmail = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "sms-test-worker",
      sendEmail,
      sendSms,
    });

    expect(sendSms).toHaveBeenCalledOnce();
    expect(sendSms).toHaveBeenCalledWith({
      to: "+2348012345678",
      body: "Thank you for your enquiry.",
    });
    expect(sendEmail).not.toHaveBeenCalled();

    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "sent" }],
    });
    expect(state.message.status).toBe("sent");
    expect(state.message.provider_message_id).toBe("termii-test-101");
    expect(state.attemptStatus).toBe("sent");
    expect(
      state.queries.some(
        (query) => query.includes("CASE WHEN $4 = 'sms' THEN 'termii'"),
      ),
    ).toBe(true);
  });

  it("sends an eligible email and records the provider message ID", async () => {
    const { db, state } = createHarness();

    const sendEmail = vi.fn().mockResolvedValue({
      provider: "resend",
      providerMessageId: "resend-test-101",
    });

    const result = await processDueFollowUpMessages({
      db,
      workerId: "test-worker",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith({
      to: "customer@example.com",
      subject: "Checking in",
      body: "Thank you for your enquiry.",
    });

    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "sent" }],
    });

    expect(state.message.status).toBe("sent");
    expect(state.message.provider_message_id).toBe("resend-test-101");
    expect(state.attemptStatus).toBe("sent");
  });

  it("records a provider failure for retry without losing the message", async () => {
    const { db, state } = createHarness();

    const rejection = new Error("Simulated provider rejection.");
    rejection.deliveryOutcome = "rejected";
    const sendEmail = vi.fn().mockRejectedValue(rejection);

    const result = await processDueFollowUpMessages({
      db,
      workerId: "test-worker",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result.results).toEqual([
      { id: "101", status: "retry_recorded" },
    ]);

    expect(state.message.status).toBe("pending");
    expect(state.attemptStatus).toBe("failed");
  });

  it("marks an ambiguous network outcome unknown without retrying", async () => {
    const { db, state } = createHarness();
    const sendEmail = vi.fn().mockRejectedValue(
      new Error("Simulated network timeout."),
    );

    const result = await processDueFollowUpMessages({
      db,
      workerId: "test-worker",
      sendEmail,
    });

    expect(result.results).toEqual([{ id: "101", status: "unknown" }]);
    expect(state.message.status).toBe("unknown");
    expect(state.attemptStatus).toBe("unknown");
    expect(
      state.queries.some((query) => query.includes("SET status = CASE")),
    ).toBe(false);
  });

  it("cancels a message when eligibility is withdrawn after claiming", async () => {
    const { db, state } = createHarness({
      eligibleAfterClaim: false,
    });

    const sendEmail = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "test-worker",
      sendEmail,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.results).toEqual([
      { id: "101", status: "cancelled" },
    ]);

    expect(state.message.status).toBe("cancelled");
    expect(state.attemptStatus).toBe("failed");
  });

  it("does not record a provider retry when saving an accepted email fails", async () => {
    const { db, state } = createHarness({
      failSuccessPersistence: true,
    });

    const sendEmail = vi.fn().mockResolvedValue({
      provider: "resend",
      providerMessageId: "resend-test-101",
    });

    const result = await processDueFollowUpMessages({
      db,
      workerId: "test-worker",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result.results).toEqual([
      { id: "101", status: "delivery_result_unknown" },
    ]);

    expect(state.message.status).toBe("processing");
    expect(state.attemptStatus).toBe("processing");

    const retryQueries = state.queries.filter(
      (query) =>
        query.includes("SET status = CASE") &&
        query.includes("next_attempt_at") &&
        query.includes("last_error = $5"),
    );

    expect(retryQueries).toHaveLength(0);
  });

  it("renews message locks while a provider request is running", async () => {
    const { db, state } = createHarness();

    const sendEmail = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return {
        provider: "resend",
        providerMessageId: "resend-heartbeat-101",
      };
    });

    const result = await processDueFollowUpMessages({
      db,
      workerId: "heartbeat-test-worker",
      sendEmail,
      heartbeatIntervalMs: 1000,
    });

    expect(result.results).toEqual([{ id: "101", status: "sent" }]);
    expect(
      state.queries.some(
        (query) =>
          query.includes("SET locked_at = NOW()") &&
          query.includes("ANY($2)"),
      ),
    ).toBe(true);
  });

  it("rolls back when the delivery-attempt record cannot be updated", async () => {
    const { db, state } = createHarness({
      failAttemptUpdate: true,
    });

    const sendEmail = vi.fn().mockResolvedValue({
      provider: "resend",
      providerMessageId: "resend-attempt-test-101",
    });

    const result = await processDueFollowUpMessages({
      db,
      workerId: "attempt-record-test-worker",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(result.results).toEqual([
      { id: "101", status: "delivery_result_unknown" },
    ]);
    expect(state.queries).toContain("ROLLBACK");
  });

  it("marks abandoned processing messages as unknown without retrying", async () => {
    const { db, state } = createHarness({ noDueMessages: true });
    const sendEmail = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "recovery-test-worker",
      sendEmail,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 0, results: [] });

    const staleAttemptQuery = state.queries.find(
      (query) => query.includes("UPDATE message_delivery_attempts a"),
    );

    const staleMessageQuery = state.queries.find(
      (query) =>
        query.includes("UPDATE follow_up_messages") &&
        query.includes("INTERVAL '10 minutes'"),
    );

    expect(staleAttemptQuery).toContain("SET status = 'unknown'");
    expect(staleAttemptQuery).toContain("provider outcome is unknown");

    expect(staleMessageQuery).toContain("SET status = 'unknown'");
    expect(staleMessageQuery).toContain("INTERVAL '10 minutes'");
    expect(staleMessageQuery).not.toContain("next_attempt_at = NOW()");
  });


  it("sends an eligible WhatsApp message using its approved template", async () => {
    const { db, state } = createHarness({ channel: "whatsapp" });
    const sendWhatsApp = vi.fn(async () => ({
      provider: "meta_whatsapp",
      providerMessageId: "wamid.worker-test-101",
    }));

    const result = await processDueFollowUpMessages({
      db,
      workerId: "whatsapp-worker-1",
      sendWhatsApp,
    });

    expect(sendWhatsApp).toHaveBeenCalledWith({
      to: "+2348012345678",
      templateName: "hello_world",
    });
    expect(result.results).toEqual([
      { id: "101", status: "sent" },
    ]);
    expect(state.message.provider_message_id).toBe("wamid.worker-test-101");
    expect(state.attemptStatus).toBe("sent");
    expect(state.queries.some((sql) =>
      sql.includes("SELECT pg_advisory_xact_lock") &&
      sql.includes("$1")
    )).toBe(true);
  });

  it("reconciles an early delivered WhatsApp webhook after saving the provider ID", async () => {
    const eventDate = new Date("2026-11-11T11:00:00.000Z");
    const { db, state } = createHarness({
      channel: "whatsapp",
      whatsappEvents: [{
        id: "501",
        event_status: "delivered",
        provider_event_at: eventDate,
        error_message: null,
        processing_result: "unmatched",
      }],
    });

    const sendWhatsApp = vi.fn(async () => ({
      provider: "meta_whatsapp",
      providerMessageId: "wamid.early-delivered-101",
    }));

    const result = await processDueFollowUpMessages({
      db,
      workerId: "whatsapp-worker-2",
      sendWhatsApp,
    });

    expect(result.results).toEqual([
      { id: "101", status: "sent" },
    ]);
    expect(state.message.provider_message_id).toBe(
      "wamid.early-delivered-101",
    );
    expect(state.message.status).toBe("delivered");
    expect(state.message.provider_event_at).toEqual(eventDate);
    expect(state.attemptStatus).toBe("sent");
    expect(state.whatsappEvents[0].processing_result).toBe("matched");
  });

  it("reconciles an early failed WhatsApp webhook without retrying an accepted message", async () => {
    const eventDate = new Date("2026-11-11T11:05:00.000Z");
    const { db, state } = createHarness({
      channel: "whatsapp",
      whatsappEvents: [{
        id: "502",
        event_status: "failed",
        provider_event_at: eventDate,
        error_message: "Recipient is unavailable.",
        processing_result: "unmatched",
      }],
    });

    const sendWhatsApp = vi.fn(async () => ({
      provider: "meta_whatsapp",
      providerMessageId: "wamid.early-failed-101",
    }));

    const result = await processDueFollowUpMessages({
      db,
      workerId: "whatsapp-worker-3",
      sendWhatsApp,
    });

    expect(sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([
      { id: "101", status: "sent" },
    ]);
    expect(state.message.status).toBe("failed");
    expect(state.message.provider_message_id).toBe(
      "wamid.early-failed-101",
    );
    expect(state.attemptStatus).toBe("failed");
    expect(state.whatsappEvents[0].processing_result).toBe("matched");
  });

});
