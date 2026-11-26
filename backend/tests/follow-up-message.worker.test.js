import { describe, it, expect, vi } from "vitest";
import { processDueFollowUpMessages } from "../src/workers/follow-up-message.worker.js";

function createHarness({
  eligibleAfterClaim = true,
  failEligibilityCheck = false,
  failSuccessPersistence = false,
  failAttemptUpdate = false,
  noDueMessages = false,
  channel = "email",
  sourceType = "follow_up",
  templateComponents = [],
  whatsappEvents = [],
  resendEvents = [],
  billingRateUnavailable = false,
  insufficientWalletFunds = false,
} = {}) {
  const message = {
    id: "101",
    business_id: "7",
    source_type: sourceType,
    follow_up_id: sourceType === "restock" ? null : "4",
    enquiry_id: sourceType === "restock" ? null : "9",
    restock_recipient_id: sourceType === "restock" ? "201" : null,
    customer_id: "6",
    channel,
    recipient: ["sms", "whatsapp"].includes(channel)
      ? "+2348012345678"
      : "customer@example.com",
    subject: channel === "email"
      ? sourceType === "restock" ? "Product is back in stock" : "Checking in"
      : null,
    body: sourceType === "restock"
      ? "The product you were interested in is back in stock."
      : "Thank you for your enquiry.",
    template_key: channel === "whatsapp" ? "hello_world" : null,
    template_components: templateComponents,
    attempt_count: 0,
    max_attempts: 5,
    status: "pending",
  };

  const state = {
    message: { ...message },
    attemptStatus: null,
    whatsappEvents: whatsappEvents.map((event) => ({ ...event })),
    resendEvents: resendEvents.map((event) => ({ ...event })),
    restockRecipient: {
      id: "201",
      status: "queued",
      interest_id: "301",
      skip_reason: null,
    },
    productInterest: {
      id: "301",
      status: "waiting",
    },
    queries: [],
  };

  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push(normalized);

      if (/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized)) {
        return { rows: [], rowCount: null };
      }

      // Communication billing SQL mocks.
      if (normalized.startsWith("SELECT channel, unit_name, rate_kobo FROM communication_channel_rates")) {
        return billingRateUnavailable
          ? { rows: [], rowCount: 0 }
          : {
              rows: [{
                channel: values[0],
                unit_name: values[0] === "sms" ? "segment" : "message",
                rate_kobo: "1",
              }],
              rowCount: 1,
            };
      }

      if (normalized.startsWith("SELECT id, balance_kobo, currency FROM business_wallets")) {
        return {
          rows: [{
            id: "wallet-7",
            balance_kobo: insufficientWalletFunds ? "0" : "100000",
            currency: "NGN",
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("SELECT COALESCE(SUM(amount_kobo), 0)::TEXT AS reserved_kobo")) {
        return { rows: [{ reserved_kobo: "0" }], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO wallet_reservations")) {
        state.billingReservation = {
          id: "reservation-101",
          business_id: values[0],
          wallet_id: values[1],
          message_id: values[2],
          attempt_number: values[3],
          channel: values[4],
          unit_count: values[5],
          unit_rate_kobo: values[6],
          amount_kobo: values[7],
          status: "reserved",
        };

        return {
          rows: [{
            id: "reservation-101",
            amount_kobo: values[7],
            status: "reserved",
          }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("SELECT * FROM wallet_reservations")) {
        return {
          rows: state.billingReservation ? [{ ...state.billingReservation }] : [],
          rowCount: state.billingReservation ? 1 : 0,
        };
      }

      if (normalized.startsWith("SELECT id, balance_kobo FROM business_wallets")) {
        return {
          rows: [{ id: values[0], balance_kobo: "100000" }],
          rowCount: 1,
        };
      }

      if (normalized.startsWith("UPDATE business_wallets")) {
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO wallet_transactions")) {
        return { rows: [{ id: "ledger-101" }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE wallet_reservations") && normalized.includes("SET status = 'captured'")) {
        if (state.billingReservation) state.billingReservation.status = "captured";
        return { rows: [{ id: values[0] }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE wallet_reservations") && normalized.includes("SET status = 'released'")) {
        if (state.billingReservation) state.billingReservation.status = "released";
        return { rows: [{ id: "reservation-101" }], rowCount: 1 };
      }

      if (normalized.startsWith("SELECT id FROM wallet_transactions")) {
        const captured = state.billingReservation?.status === "captured";
        return {
          rows: captured ? [{ id: "ledger-101" }] : [],
          rowCount: captured ? 1 : 0,
        };
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

      if (normalized.startsWith("SELECT id, event_type, event_created_at FROM resend_webhook_events")) {
        const rows = state.resendEvents
          .filter((event) =>
            String(event.provider_message_id || values[0]) === String(values[0]) &&
            event.processing_result === "unmatched"
          )
          .sort((a, b) => {
            const aTime = a.event_created_at
              ? new Date(a.event_created_at).getTime()
              : Infinity;
            const bTime = b.event_created_at
              ? new Date(b.event_created_at).getTime()
              : Infinity;
            return aTime - bTime || Number(a.id) - Number(b.id);
          });
        return { rows, rowCount: rows.length };
      }

      if (normalized.startsWith("SELECT id, business_id, status, provider_event_at, source_type")) {
        const matches =
          state.message.provider === "resend" &&
          state.message.channel === "email" &&
          String(state.message.provider_message_id) === String(values[0]);
        return {
          rows: matches ? [{
            id: state.message.id,
            business_id: state.message.business_id,
            status: state.message.status,
            provider_event_at: state.message.provider_event_at || null,
            source_type: state.message.source_type,
            conversation_id: state.message.conversation_id || null,
            conversation_message_id: state.message.conversation_message_id || null,
          }] : [],
          rowCount: matches ? 1 : 0,
        };
      }

      if (normalized.startsWith("SELECT id, event_status")) {
        return { rows: [], rowCount: 0 };
      }

      if (normalized.startsWith("UPDATE resend_webhook_events")) {
        const event = state.resendEvents.find(
          (item) => String(item.id) === String(values[0]),
        );
        if (event) event.processing_result = values[1];
        return { rows: [], rowCount: event ? 1 : 0 };
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
        normalized.includes("SET status = 'pending'") &&
        normalized.includes("next_attempt_at = NOW() + INTERVAL '1 minute'") &&
        normalized.includes("attempt_count = $5")
      ) {
        state.message.status = "pending";
        state.message.last_error = values[3];
        state.message.locked_by = null;
        state.message.locked_at = null;
        state.message.next_attempt_at = "scheduled";

        // Keep attempt_count unchanged: this attempt is retained for auditing.
        return { rows: [{ id: state.message.id }], rowCount: 1 };
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
        if (normalized.includes("billing_blocked")) {
          state.message.status = "billing_blocked";
          state.message.attempt_count = Math.max(
            state.message.attempt_count - 1,
            0,
          );
          state.message.locked_by = null;
          state.message.locked_at = null;
          return { rows: [{ id: state.message.id }], rowCount: 1 };
        }

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
          state.message.provider = values[3];
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

      if (normalized.startsWith("DELETE FROM message_delivery_attempts")) {
        state.attemptStatus = null;
        return { rows: [], rowCount: 1 };
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

      if (
        normalized.startsWith("UPDATE restock_campaign_recipients") &&
        normalized.includes("SET status = 'sending'")
      ) {
        state.restockRecipient.status = "sending";
        state.restockRecipient.skip_reason = null;
        return { rows: [{ id: state.restockRecipient.id }], rowCount: 1 };
      }

      if (
        normalized.startsWith("UPDATE restock_campaign_recipients") &&
        normalized.includes("SET status = 'sent'")
      ) {
        state.restockRecipient.status = "sent";
        state.restockRecipient.skip_reason = null;
        return {
          rows: [{ interest_id: state.restockRecipient.interest_id }],
          rowCount: 1,
        };
      }

      if (
        normalized.startsWith("UPDATE restock_campaign_recipients") &&
        normalized.includes("SET status = 'skipped'")
      ) {
        state.restockRecipient.status = "skipped";
        state.restockRecipient.skip_reason =
          "consent_or_eligibility_no_longer_valid";
        return { rows: [{ id: state.restockRecipient.id }], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE product_interests")) {
        state.productInterest.status = "notified";
        return { rows: [{ id: state.productInterest.id }], rowCount: 1 };
      }

      if (
        normalized.startsWith("UPDATE conversation_messages cm") &&
        normalized.includes("SET delivery_status = 'unknown'")
      ) {
        return { rows: [], rowCount: 0 };
      }

      if (
        normalized.startsWith(
          "UPDATE restock_campaign_recipients r"
        )
      ) {
        return { rows: [], rowCount: 0 };
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

      if (normalized.includes("FROM business_communication_profiles")) {
        return {
          rows: state.businessSmsProfile ? [state.businessSmsProfile] : [],
          rowCount: state.businessSmsProfile ? 1 : 0,
        };
      }

      if (
        normalized.includes("SELECT 1 FROM restock_campaign_recipients r")
      ) {
        if (failEligibilityCheck) {
          throw new Error("Simulated eligibility database failure.");
        }

        return {
          rows: eligibleAfterClaim ? [{ "?column?": 1 }] : [],
          rowCount: eligibleAfterClaim ? 1 : 0,
        };
      }

      if (normalized.includes("SELECT 1 FROM follow_ups")) {
        if (failEligibilityCheck) {
          throw new Error("Simulated eligibility database failure.");
        }

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
    state.businessSmsProfile = {
      sms_sender_id: "StoreABC",
      sms_status: "approved",
    };

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
      senderId: "StoreABC",
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
    expect(state.billingReservation.status).toBe("captured");
    expect(
      state.queries.some((query) =>
        query.startsWith("INSERT INTO wallet_transactions")
      ),
    ).toBe(true);
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
    expect(state.billingReservation.status).toBe("released");
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
    expect(state.billingReservation.status).toBe("reserved");
    expect(state.billingReservation.status).toBe("reserved");
    expect(
      state.queries.some((query) => query.includes("SET status = CASE")),
    ).toBe(false);
    expect(
      state.queries.some((query) =>
        query.includes("SET status = 'released'")
      ),
    ).toBe(false);
  });

  it.each([
    ["an unavailable channel rate", { billingRateUnavailable: true }],
    ["insufficient wallet funds", { insufficientWalletFunds: true }],
  ])(
    "blocks delivery for %s without consuming a provider attempt",
    async (_description, billingOptions) => {
      const { db, state } = createHarness(billingOptions);

      const sendEmail = vi.fn();
      const sendSms = vi.fn();
      const sendWhatsApp = vi.fn();

      const result = await processDueFollowUpMessages({
        db,
        workerId: "billing-blocked-test-worker",
        sendEmail,
        sendSms,
        sendWhatsApp,
      });

      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
      expect(sendWhatsApp).not.toHaveBeenCalled();

      expect(result.processed).toBe(1);
      expect(result.results[0].status).toBe("billing_blocked");

      expect(state.message.status).toBe("billing_blocked");
      expect(state.message.attempt_count).toBe(0);
      expect(state.message.locked_by).toBeNull();
      expect(state.message.locked_at).toBeNull();
      expect(state.attemptStatus).toBeNull();

      expect(
        state.queries.some((query) =>
          query.startsWith("DELETE FROM message_delivery_attempts")
        ),
      ).toBe(true);

      expect(
        state.queries.some((query) =>
          query.startsWith("UPDATE follow_up_messages") &&
          query.includes("billing_blocked")
        ),
      ).toBe(true);

      expect(state.queries).toContain("COMMIT");
      expect(state.queries).toContain("ROLLBACK");
    },
  );

  it.each([
    ["missing profile", null],
    ["pending Sender ID", {
      sms_sender_id: "StoreABC",
      sms_status: "pending",
    }],
    ["rejected Sender ID", {
      sms_sender_id: "StoreABC",
      sms_status: "rejected",
    }],
    ["approved profile with blank Sender ID", {
      sms_sender_id: "   ",
      sms_status: "approved",
    }],
  ])("blocks SMS delivery for a %s", async (_scenario, profile) => {
    const { db, state } = createHarness({ channel: "sms" });
    state.businessSmsProfile = profile;

    const sendSms = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "sms-unapproved-sender-test-worker",
      sendSms,
    });

    // No provider request must occur without a valid, approved identity.
    expect(sendSms).not.toHaveBeenCalled();

    // The message is safely returned to the queue and the failed attempt
    // is recorded; no provider message ID can be created.
    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "retry_recorded" }],
    });
    expect(state.message.status).toBe("pending");
    expect(state.message.provider_message_id ?? null).toBeNull();
    expect(state.attemptStatus).toBe("failed");
    expect(state.billingReservation.status).toBe("released");

    expect(
      state.queries.some((query) =>
        query.includes("FROM business_communication_profiles") &&
        query.includes("WHERE business_id = $1"),
      ),
    ).toBe(true);
  });

  it("releases a claimed message when the eligibility database check fails", async () => {
    const { db, state } = createHarness({
      failEligibilityCheck: true,
    });

    const sendEmail = vi.fn();
    const sendSms = vi.fn();
    const sendWhatsApp = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "eligibility-error-test-worker",
      sendEmail,
      sendSms,
      sendWhatsApp,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();

    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "eligibility_check_error" }],
    });

    expect(state.message.status).toBe("pending");
    expect(state.message.attempt_count).toBe(1);
    expect(state.message.locked_by).toBeNull();
    expect(state.message.locked_at).toBeNull();
    expect(state.message.next_attempt_at).toBe("scheduled");
    expect(state.attemptStatus).toBe("failed");

    const messageRecoveryQuery = state.queries.find(
      (query) =>
        query.includes("UPDATE follow_up_messages") &&
        query.includes("next_attempt_at"),
    );

    expect(messageRecoveryQuery).toBeDefined();
    expect(messageRecoveryQuery).not.toContain(
      "GREATEST(attempt_count - 1, 0)",
    );

    const attemptRecoveryQuery = state.queries.find(
      (query) =>
        query.startsWith("UPDATE message_delivery_attempts") &&
        query.includes("attempt_number = $3") &&
        query.includes("SET status = 'failed'") &&
        query.includes("error_message = $4"),
    );

    expect(attemptRecoveryQuery).toBeDefined();
    expect(attemptRecoveryQuery).toContain("SET status = 'failed'");
    expect(
      state.queries.some(
        (query) => query.startsWith("DELETE FROM message_delivery_attempts"),
      ),
    ).toBe(false);

    expect(state.queries).toContain("COMMIT");
    expect(state.queries).not.toContain("ROLLBACK");
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


  it("forwards queued WhatsApp template parameters to the sender unchanged", async () => {
    const components = [{
      type: "body",
      parameters: [
        { type: "text", text: "Ada" },
        { type: "text", text: "Order 123" },
      ],
    }];

    const { db } = createHarness({
      channel: "whatsapp",
      templateComponents: components,
    });

    const sendWhatsApp = vi.fn(async () => ({
      provider: "meta_whatsapp",
      providerMessageId: "wamid.template-parameters-101",
    }));

    const result = await processDueFollowUpMessages({
      db,
      workerId: "whatsapp-template-parameters-worker",
      sendWhatsApp,
      resolveWhatsAppCredentials: vi.fn(async () => ({
        status: "ready",
        credentials: {
          accessToken: "tenant-token",
          phoneNumberId: "123456789",
        },
      })),
    });

    expect(sendWhatsApp).toHaveBeenCalledWith({
      to: "+2348012345678",
      templateName: "hello_world",
      components,
      accessToken: "tenant-token",
      phoneNumberId: "123456789",
    });

    expect(result.results).toEqual([
      { id: "101", status: "sent" },
    ]);
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
      resolveWhatsAppCredentials: vi.fn(async () => ({
        status: "ready",
        credentials: {
          accessToken: "tenant-token",
          phoneNumberId: "123456789",
        },
      })),
    });

    expect(sendWhatsApp).toHaveBeenCalledWith({
      to: "+2348012345678",
      templateName: "hello_world",
      components: [],
      accessToken: "tenant-token",
      phoneNumberId: "123456789",
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
      resolveWhatsAppCredentials: vi.fn(async () => ({
        status: "ready",
        credentials: {
          accessToken: "tenant-token",
          phoneNumberId: "123456789",
        },
      })),
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
      resolveWhatsAppCredentials: vi.fn(async () => ({
        status: "ready",
        credentials: {
          accessToken: "tenant-token",
          phoneNumberId: "123456789",
        },
      })),
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


  it("reconciles an early delivered Resend webhook after saving the provider ID", async () => {
    const eventDate = new Date("2026-11-11T11:00:00.000Z");
    const { db, state } = createHarness({
      channel: "email",
      resendEvents: [{
        id: "601",
        provider_message_id: "resend.early-delivered-101",
        event_type: "email.delivered",
        event_created_at: eventDate,
        processing_result: "unmatched",
      }],
    });

    const sendEmail = vi.fn(async () => ({
      provider: "resend",
      providerMessageId: "resend.early-delivered-101",
    }));

    const result = await processDueFollowUpMessages({
      db,
      workerId: "resend-worker-2",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.results).toEqual([
      { id: "101", status: "sent" },
    ]);
    expect(state.message.provider).toBe("resend");
    expect(state.message.provider_message_id).toBe(
      "resend.early-delivered-101",
    );
    expect(state.message.status).toBe("delivered");
    expect(state.message.provider_event_at).toEqual(eventDate);
    expect(state.attemptStatus).toBe("sent");
    expect(state.resendEvents[0].processing_result).toBe("matched");
  });

  it("sends a restock notification and marks its interest as notified", async () => {
    const { db, state } = createHarness({
      sourceType: "restock",
      channel: "email",
    });

    const sendEmail = vi.fn().mockResolvedValue({
      provider: "resend",
      providerMessageId: "resend-restock-201",
    });

    const result = await processDueFollowUpMessages({
      db,
      workerId: "restock-success-worker",
      sendEmail,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    expect(sendEmail).toHaveBeenCalledWith({
      to: "customer@example.com",
      subject: "Product is back in stock",
      body: "The product you were interested in is back in stock.",
    });
    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "sent" }],
    });
    expect(state.message.status).toBe("sent");
    expect(state.message.provider_message_id).toBe("resend-restock-201");
    expect(state.attemptStatus).toBe("sent");
    expect(state.billingReservation.status).toBe("captured");
    expect(state.restockRecipient.status).toBe("sent");
    expect(state.productInterest.status).toBe("notified");
  });

  it("skips a restock recipient when eligibility is withdrawn before delivery", async () => {
    const { db, state } = createHarness({
      sourceType: "restock",
      eligibleAfterClaim: false,
    });

    const sendEmail = vi.fn();
    const sendSms = vi.fn();
    const sendWhatsApp = vi.fn();

    const result = await processDueFollowUpMessages({
      db,
      workerId: "restock-ineligible-worker",
      sendEmail,
      sendSms,
      sendWhatsApp,
    });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
    expect(sendWhatsApp).not.toHaveBeenCalled();
    expect(result).toEqual({
      processed: 1,
      results: [{ id: "101", status: "cancelled" }],
    });
    expect(state.message.status).toBe("cancelled");
    expect(state.attemptStatus).toBe("failed");
    expect(state.restockRecipient.status).toBe("skipped");
    expect(state.productInterest.status).toBe("waiting");
    expect(state.billingReservation).toBeUndefined();
  });

});
