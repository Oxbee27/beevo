import { beforeEach, describe, expect, it, vi } from "vitest";

const { connect } = vi.hoisted(() => ({ connect: vi.fn() }));

vi.mock("../src/config/database.js", () => ({
  default: { connect },
}));

import {
  processMetaWhatsAppAccountEvent,
} from "../src/services/process-meta-whatsapp-account-event.service.js";

const fingerprint = "a".repeat(64);

function harness({ inserted = true, existing = null, matched = true, failUpdate = false } = {}) {
  const calls = [];
  const client = {
    async query(sql, values = []) {
      const normalized = sql.replace(/\\s+/g, " ").trim();
      calls.push({ sql: normalized, values });

      if (["BEGIN", "COMMIT", "ROLLBACK"].includes(normalized)) {
        return { rows: [], rowCount: null };
      }
      if (normalized.startsWith("SELECT pg_advisory_xact_lock")) {
        return { rows: [], rowCount: null };
      }
      if (normalized.startsWith("INSERT INTO meta_whatsapp_account_webhook_events")) {
        return { rows: inserted ? [{ id: "1" }] : [], rowCount: inserted ? 1 : 0 };
      }
      if (normalized.startsWith("SELECT") && normalized.includes("FROM meta_whatsapp_account_webhook_events")) {
        return { rows: existing ? [existing] : [], rowCount: existing ? 1 : 0 };
      }
      if (normalized.startsWith("UPDATE business_communication_channels")) {
        if (failUpdate) throw new Error("Channel update failed");
        return { rows: matched ? [{ id: "9" }] : [], rowCount: matched ? 1 : 0 };
      }
      if (normalized.startsWith("UPDATE meta_whatsapp_account_webhook_events")) {
        return { rows: [], rowCount: 1 };
      }
      throw new Error("Unexpected SQL: " + normalized);
    },
    release: vi.fn(),
  };

  connect.mockResolvedValue(client);
  return { calls, client };
}

const input = {
  eventFingerprint: fingerprint,
  field: "phone_number_quality_update",
  externalAccountId: "WABA-123",
  phoneNumberId: "PHONE-456",
  event: {
    phone_number_id: "PHONE-456",
    quality: "GREEN",
    access_token: "must-not-be-stored",
  },
};

describe("processMetaWhatsAppAccountEvent", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a matched event and updates channel metadata without changing connection status", async () => {
    const { calls, client } = harness();
    const result = await processMetaWhatsAppAccountEvent(input);

    expect(result).toEqual({ status: "matched" });
    const update = calls.find((call) => call.sql.startsWith("UPDATE business_communication_channels"));
    expect(update.values[1]).toBe("WABA-123");
    expect(update.values[2]).toBe("PHONE-456");
    expect(update.values[0]).not.toContain("must-not-be-stored");
    expect(update.sql).not.toContain("connection_status");
    expect(update.sql).not.toContain("is_active");
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("records an unmatched event for a later retry", async () => {
    const { calls } = harness({ matched: false });
    const result = await processMetaWhatsAppAccountEvent(input);

    expect(result).toEqual({ status: "unmatched" });
    expect(calls.some((call) =>
      call.sql.startsWith("UPDATE meta_whatsapp_account_webhook_events")
      && call.values[1] === "unmatched"
    )).toBe(true);
  });

  it("retries an existing unmatched event using its stored payload", async () => {
    const existing = {
      id: "1",
      event_field: input.field,
      external_account_id: input.externalAccountId,
      external_channel_id: input.phoneNumberId,
      event_payload: { quality: "GREEN" },
      processing_result: "unmatched",
    };
    const { calls } = harness({ inserted: false, existing, matched: true });
    const result = await processMetaWhatsAppAccountEvent(input);

    expect(result).toEqual({ status: "matched" });
    const update = calls.find((call) => call.sql.startsWith("UPDATE business_communication_channels"));
    expect(update.values[0]).toContain("GREEN");
  });

  it("does not process an already matched duplicate", async () => {
    const existing = { processing_result: "matched" };
    const { calls } = harness({ inserted: false, existing });
    const result = await processMetaWhatsAppAccountEvent(input);

    expect(result).toEqual({ status: "duplicate" });
    expect(calls.some((call) => call.sql.startsWith("UPDATE business_communication_channels"))).toBe(false);
  });

  it("rolls back when the channel update fails", async () => {
    const { calls, client } = harness({ failUpdate: true });

    await expect(processMetaWhatsAppAccountEvent(input)).rejects.toThrow("Channel update failed");
    expect(calls.some((call) => call.sql === "ROLLBACK")).toBe(true);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("ignores unsupported event fields without opening a transaction", async () => {
    const result = await processMetaWhatsAppAccountEvent({
      ...input,
      field: "unknown_meta_event",
    });

    expect(result).toEqual({ status: "ignored" });
    expect(connect).not.toHaveBeenCalled();
  });
});
