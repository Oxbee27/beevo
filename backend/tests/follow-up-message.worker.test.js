import { describe, it, expect, vi } from "vitest";
import { processDueFollowUpMessages } from "../src/workers/follow-up-message.worker.js";

function createHarness({
  eligibleAfterClaim = true,
  failSuccessPersistence = false,
} = {}) {
  const message = {
    id: "101",
    business_id: "7",
    follow_up_id: "4",
    customer_id: "6",
    recipient: "customer@example.com",
    subject: "Checking in",
    body: "Thank you for your enquiry.",
    attempt_count: 0,
    max_attempts: 5,
    status: "pending",
  };

  const state = {
    message: { ...message },
    attemptStatus: null,
    queries: [],
  };

  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push(normalized);

      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
        return { rows: [], rowCount: null };
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
          rows: [
            {
              ...state.message,
            },
          ],
          rowCount: 1,
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

      if (normalized.startsWith("UPDATE follow_up_messages")) {
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

      if (normalized.startsWith("UPDATE message_delivery_attempts")) {
        if (normalized.includes("SET status = 'sent'")) {
          state.attemptStatus = "sent";
        } else if (normalized.includes("SET status = 'failed'")) {
          state.attemptStatus = "failed";
        }

        return { rows: [], rowCount: 1 };
      }

      throw new Error(`Unexpected test SQL: ${normalized}`);
    },

    release: vi.fn(),
  };

  const db = {
    connect: vi.fn(async () => client),

    async query(sql) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push(normalized);

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

    const sendEmail = vi.fn().mockRejectedValue(
      new Error("Simulated provider rejection."),
    );

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
});
