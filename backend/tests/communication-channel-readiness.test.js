import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCommunicationChannelReadiness } from "../src/services/get-communication-channel-readiness.service.js";

const environmentVariables = [
  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_WEBHOOK_SECRET",
  "TERMII_API_KEY",
  "TERMII_BASE_URL",
  "TERMII_SMS_CHANNEL",
  "TERMII_WEBHOOK_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_API_VERSION",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_VERIFY_TOKEN",
];

const originalEnvironment = {};

beforeEach(() => {
  for (const key of environmentVariables) {
    originalEnvironment[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of environmentVariables) {
    if (originalEnvironment[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnvironment[key];
    }
  }
});

describe("Communication channel readiness", () => {
  it("reports all channels as not configured when credentials are absent", () => {
    const result = getCommunicationChannelReadiness();

    expect(result.channels.email.status).toBe("not_configured");
    expect(result.channels.sms.status).toBe("not_configured");
    expect(result.channels.whatsapp.status).toBe("not_configured");
  });

  it("reports email as ready when Resend configuration is present", () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";

    const result = getCommunicationChannelReadiness();

    expect(result.channels.email).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
  });

  it("reports SMS provider as ready when Termii credentials are present", () => {
    process.env.TERMII_API_KEY = "test-termii-key";
    process.env.TERMII_BASE_URL = "https://api.ng.termii.com";
    process.env.TERMII_SMS_CHANNEL = "generic";

    const result = getCommunicationChannelReadiness();

    expect(result.channels.sms).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
  });

  it("reports WhatsApp as ready when Meta configuration is present", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "test-meta-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_API_VERSION = "v23.0";

    const result = getCommunicationChannelReadiness();

    expect(result.channels.whatsapp).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
  });

  it("treats whitespace-only credentials and webhook secrets as missing", () => {
    process.env.RESEND_API_KEY = "   ";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";
    process.env.TERMII_API_KEY = "test-termii-key";
    process.env.TERMII_BASE_URL = "https://api.ng.termii.com";
    process.env.TERMII_SMS_CHANNEL = "generic";
    process.env.WHATSAPP_ACCESS_TOKEN = "test-meta-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_API_VERSION = "v23.0";

    process.env.RESEND_WEBHOOK_SECRET = "   ";
    process.env.TERMII_WEBHOOK_SECRET = "   ";
    process.env.WHATSAPP_APP_SECRET = "   ";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";

    const result = getCommunicationChannelReadiness();

    expect(result.channels.email).toMatchObject({
      configured: false,
      status: "not_configured",
      missing: ["RESEND_API_KEY"],
    });
    expect(result.channels.sms).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
    expect(result.channels.whatsapp.status).toBe("configured");
    expect(result.webhooks).toEqual({
      resend: false,
      termii: false,
      whatsapp: false,
    });
  });

  it("identifies missing configuration without exposing credential values", () => {
    process.env.RESEND_API_KEY = "private-test-key";

    const result = getCommunicationChannelReadiness();
    const serialized = JSON.stringify(result);

    expect(result.channels.email.missing).toContain("RESEND_FROM_EMAIL");
    expect(serialized).not.toContain("private-test-key");
  });

  it("reports webhook configuration separately from sending readiness", () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";

    const result = getCommunicationChannelReadiness();

    expect(result.channels.email.status).toBe("configured");
    expect(result.webhooks.resend).toBe(true);
    expect(result.webhooks.termii).toBe(false);
    expect(result.webhooks.whatsapp).toBe(false);
  });
});
