import { describe, it, expect, vi } from "vitest";
import { sendFollowUpSms } from "../src/utils/send-follow-up-sms.js";

const env = {
  TERMII_API_KEY: "test-api-key",
  TERMII_SENDER_ID: "BeevoCRM",
  TERMII_BASE_URL: "https://api.ng.termii.com",
  TERMII_SMS_CHANNEL: "generic",
};

const input = {
  to: "+2348012345678",
  body: "Your business has a new update.",
  env,
};

describe("sendFollowUpSms", () => {
  it("sends an SMS through Termii and returns its provider reference", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        code: "ok",
        message_id: "termii-message-123",
      }),
    });

    const result = await sendFollowUpSms({ ...input, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledOnce();

    const [url, options] = fetchImpl.mock.calls[0];
    const payload = JSON.parse(options.body);

    expect(url).toBe("https://api.ng.termii.com/api/sms/send");
    expect(payload.to).toBe("2348012345678");
    expect(payload.api_key).toBe("test-api-key");
    expect(payload.from).toBe("BeevoCRM");
    expect(payload.channel).toBe("generic");

    expect(result).toEqual({
      provider: "termii",
      providerMessageId: "termii-message-123",
    });
  });

  it("rejects incomplete configuration without calling Termii", async () => {
    const fetchImpl = vi.fn();

    await expect(
      sendFollowUpSms({
        ...input,
        env: {},
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      deliveryOutcome: "rejected",
    });

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("classifies provider 4xx responses as rejected", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: "Invalid sender ID" }),
    });

    await expect(
      sendFollowUpSms({ ...input, fetchImpl }),
    ).rejects.toMatchObject({
      message: "Invalid sender ID",
      deliveryOutcome: "rejected",
    });
  });

  it("classifies provider 5xx responses as unknown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: "Service unavailable" }),
    });

    await expect(
      sendFollowUpSms({ ...input, fetchImpl }),
    ).rejects.toMatchObject({
      deliveryOutcome: "unknown",
    });
  });

  it("classifies network failures as unknown", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(
      new Error("Network unavailable"),
    );

    await expect(
      sendFollowUpSms({ ...input, fetchImpl }),
    ).rejects.toMatchObject({
      deliveryOutcome: "unknown",
    });
  });

  it("classifies successful responses without a message ID as unknown", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: "ok" }),
    });

    await expect(
      sendFollowUpSms({ ...input, fetchImpl }),
    ).rejects.toMatchObject({
      deliveryOutcome: "unknown",
    });
  });
});
