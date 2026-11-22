import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  it("reports all channels as not configured when credentials are absent", async () => {
    const result = await getCommunicationChannelReadiness({
      businessId: 10,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "not_connected",
        credentials: null,
      }),
    });

    expect(result.channels.email.status).toBe("not_configured");
    expect(result.channels.sms.status).toBe("not_configured");
    expect(result.channels.whatsapp).toEqual({
      configured: false,
      status: "not_configured",
      missing: ["CONNECTED_WHATSAPP_BUSINESS_ACCOUNT"],
    });
  });

  it("reports email as ready when Resend configuration is present", async () => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";

    const result = await getCommunicationChannelReadiness();

    expect(result.channels.email).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
  });

  it("reports SMS provider as ready when Termii credentials are present", async () => {
    process.env.TERMII_API_KEY = "test-termii-key";
    process.env.TERMII_BASE_URL = "https://api.ng.termii.com";
    process.env.TERMII_SMS_CHANNEL = "generic";

    const result = await getCommunicationChannelReadiness();

    expect(result.channels.sms).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
  });

  it("reports WhatsApp as ready only for a resolved tenant connection", async () => {
    const resolveWhatsAppCredentials = vi.fn().mockResolvedValue({
      status: "ready",
      credentials: {
        accessToken: "private-meta-token",
        phoneNumberId: "123456789",
      },
    });

    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials,
    });

    expect(resolveWhatsAppCredentials).toHaveBeenCalledWith({
      businessId: 25,
    });
    expect(result.channels.whatsapp).toEqual({
      configured: true,
      status: "configured",
      missing: [],
    });
    expect(JSON.stringify(result)).not.toContain("private-meta-token");
  });

  it("does not treat global WhatsApp environment variables as a tenant connection", async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "legacy-global-token";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123456789";
    process.env.WHATSAPP_API_VERSION = "v23.0";

    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "not_connected",
        credentials: null,
      }),
    });

    expect(result.channels.whatsapp.configured).toBe(false);
    expect(result.channels.whatsapp.status).toBe("not_configured");
    expect(JSON.stringify(result)).not.toContain("legacy-global-token");
  });

  it("reports ambiguous connections as not configured", async () => {
    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "ambiguous",
        credentials: null,
      }),
    });

    expect(result.channels.whatsapp).toEqual({
      configured: false,
      status: "not_configured",
      missing: ["A_SINGLE_ACTIVE_WHATSAPP_CONNECTION"],
    });
  });

  it("reports unavailable encrypted credentials as not configured", async () => {
    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "credentials_unavailable",
        credentials: null,
      }),
    });

    expect(result.channels.whatsapp).toEqual({
      configured: false,
      status: "not_configured",
      missing: ["VALID_WHATSAPP_CONNECTION_CREDENTIALS"],
    });
  });

  it("does not resolve WhatsApp credentials without a valid business ID", async () => {
    const resolveWhatsAppCredentials = vi.fn();

    const result = await getCommunicationChannelReadiness({
      businessId: "invalid",
      resolveWhatsAppCredentials,
    });

    expect(resolveWhatsAppCredentials).not.toHaveBeenCalled();
    expect(result.channels.whatsapp.configured).toBe(false);
  });

  it("treats whitespace-only provider credentials and webhook secrets as missing", async () => {
    process.env.RESEND_API_KEY = "   ";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";
    process.env.TERMII_API_KEY = "test-termii-key";
    process.env.TERMII_BASE_URL = "https://api.ng.termii.com";
    process.env.TERMII_SMS_CHANNEL = "generic";

    process.env.RESEND_WEBHOOK_SECRET = "   ";
    process.env.TERMII_WEBHOOK_SECRET = "   ";
    process.env.WHATSAPP_APP_SECRET = "   ";
    process.env.WHATSAPP_VERIFY_TOKEN = "verify-token";

    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "not_connected",
        credentials: null,
      }),
    });

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
    expect(result.channels.whatsapp.status).toBe("not_configured");
    expect(result.webhooks).toEqual({
      resend: false,
      termii: false,
      whatsapp: false,
    });
  });

  it("identifies missing configuration without exposing credential values", async () => {
    process.env.RESEND_API_KEY = "private-test-key";

    const result = await getCommunicationChannelReadiness();
    const serialized = JSON.stringify(result);

    expect(result.channels.email.missing).toContain("RESEND_FROM_EMAIL");
    expect(serialized).not.toContain("private-test-key");
  });

  it("reports webhook configuration separately from sending readiness", async () => {
    process.env.RESEND_API_KEY = "test-key";
    process.env.RESEND_FROM_EMAIL = "hello@example.com";
    process.env.RESEND_WEBHOOK_SECRET = "test-webhook-secret";

    const result = await getCommunicationChannelReadiness();

    expect(result.channels.email.status).toBe("configured");
    expect(result.webhooks.resend).toBe(true);
    expect(result.webhooks.termii).toBe(false);
    expect(result.webhooks.whatsapp).toBe(false);
  });

  it("keeps WhatsApp webhook readiness independent of tenant sending credentials", async () => {
    process.env.WHATSAPP_APP_SECRET = "meta-app-secret";
    process.env.WHATSAPP_VERIFY_TOKEN = "webhook-verify-token";

    const result = await getCommunicationChannelReadiness({
      businessId: 25,
      resolveWhatsAppCredentials: vi.fn().mockResolvedValue({
        status: "not_connected",
        credentials: null,
      }),
    });

    expect(result.channels.whatsapp.status).toBe("not_configured");
    expect(result.webhooks.whatsapp).toBe(true);
  });
});
