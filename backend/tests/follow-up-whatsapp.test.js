import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFollowUpWhatsApp } from "../src/utils/send-follow-up-whatsapp.js";

const originalEnv = { ...process.env };

const validConfig = {
  WHATSAPP_ACCESS_TOKEN: "test-access-token",
  WHATSAPP_PHONE_NUMBER_ID: "123456789012345",
  WHATSAPP_API_VERSION: "v26.0",
};

function configureEnvironment(overrides = {}) {
  Object.assign(process.env, validConfig, overrides);
}

function successfulResponse(id = "wamid.test-message-123") {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      messaging_product: "whatsapp",
      messages: [{ id }],
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();

  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }

  Object.assign(process.env, originalEnv);
});

describe("Beevo WhatsApp adapter", () => {
  it("sends an approved template through the Meta Cloud API", async () => {
    configureEnvironment();

    const fetchMock = vi.fn().mockResolvedValue(successfulResponse());
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendFollowUpWhatsApp({
      to: "+2348012345678",
      templateName: "follow_up_reminder",
      languageCode: "en",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: "Peter" }],
        },
      ],
    });

    expect(result).toEqual({
      provider: "meta_whatsapp",
      providerMessageId: "wamid.test-message-123",
    });

    expect(fetchMock).toHaveBeenCalledOnce();

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe(
      "https://graph.facebook.com/v26.0/123456789012345/messages",
    );

    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe(
      "Bearer test-access-token",
    );

    expect(JSON.parse(options.body)).toMatchObject({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "2348012345678",
      type: "template",
      template: {
        name: "follow_up_reminder",
        language: { code: "en" },
      },
    });
  });

  it("rejects requests when configuration is missing", async () => {
    delete process.env.WHATSAPP_ACCESS_TOKEN;

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "rejected" });
  });

  it("rejects invalid recipient numbers", async () => {
    configureEnvironment();

    await expect(
      sendFollowUpWhatsApp({
        to: "08012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "rejected" });
  });

  it("rejects invalid template names", async () => {
    configureEnvironment();

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "Invalid Template Name",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "rejected" });
  });

  it("classifies Meta client errors as rejected", async () => {
    configureEnvironment();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: "Template is not approved." },
        }),
      }),
    );

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "rejected" });
  });

  it("classifies Meta server errors as unknown", async () => {
    configureEnvironment();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Server error" } }),
      }),
    );

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "unknown" });
  });

  it("classifies network failures as unknown", async () => {
    configureEnvironment();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Network failure")),
    );

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "unknown" });
  });

  it("does not treat a successful response without a wamid as confirmed", async () => {
    configureEnvironment();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ messages: [] }),
      }),
    );

    await expect(
      sendFollowUpWhatsApp({
        to: "+2348012345678",
        templateName: "follow_up_reminder",
      }),
    ).rejects.toMatchObject({ deliveryOutcome: "unknown" });
  });
});
