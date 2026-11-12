import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const {
  processWhatsAppWebhookEvent,
  processWhatsAppInboundMessage,
} = vi.hoisted(() => ({
  processWhatsAppWebhookEvent: vi.fn(),
  processWhatsAppInboundMessage: vi.fn(),
}));

vi.mock("../src/services/process-whatsapp-webhook.service.js", () => ({
  processWhatsAppWebhookEvent,
}));

vi.mock("../src/services/process-whatsapp-inbound-message.service.js", () => ({
  processWhatsAppInboundMessage,
}));

import {
  handleWhatsAppWebhook,
} from "../src/controllers/whatsapp-webhook.controller.js";

function makeResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

function makeRequest(payload, secret = "test-app-secret") {
  const body = Buffer.from(JSON.stringify(payload));
  const signature = `sha256=${createHmac("sha256", secret)
    .update(body)
    .digest("hex")}`;

  return {
    body,
    get: vi.fn((header) =>
      header === "x-hub-signature-256" ? signature : undefined,
    ),
  };
}

describe("WhatsApp inbound webhook controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = "test-app-secret";
    processWhatsAppWebhookEvent.mockResolvedValue({ status: "processed" });
    processWhatsAppInboundMessage.mockResolvedValue({
      processed: true,
      stored: true,
    });
  });

  it("passes inbound text messages and contact metadata to the inbound processor", async () => {
    const req = makeRequest({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "123456789" },
            contacts: [{
              wa_id: "2348012345678",
              profile: { name: "Ada Customer" },
            }],
            messages: [{
              from: "2348012345678",
              id: "wamid.inbound.001",
              timestamp: "1794484800",
              type: "text",
              text: { body: "Hello, I need a quotation." },
            }],
          },
        }],
      }],
    });

    const res = makeResponse();

    await handleWhatsAppWebhook(req, res);

    expect(processWhatsAppInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumberId: "123456789",
        contactIdentifier: "2348012345678",
        contactDisplayName: "Ada Customer",
        providerMessageId: "wamid.inbound.001",
        messageType: "text",
        body: "Hello, I need a quotation.",
        receivedAt: new Date(1794484800 * 1000),
      }),
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      processed: 1,
      statusesProcessed: 0,
      inboundProcessed: 1,
    });
  });

  it("processes inbound messages and delivery statuses in the same webhook", async () => {
    const status = {
      id: "wamid.outbound.001",
      status: "delivered",
      timestamp: "1794484800",
      recipient_id: "2348012345678",
    };

    const req = makeRequest({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "123456789" },
            statuses: [status],
            messages: [{
              from: "2348012345678",
              id: "wamid.inbound.002",
              timestamp: "1794484801",
              type: "text",
              text: { body: "Thank you." },
            }],
          },
        }],
      }],
    });

    const res = makeResponse();

    await handleWhatsAppWebhook(req, res);

    expect(processWhatsAppWebhookEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: status,
        eventFingerprint: expect.any(String),
      }),
    );
    expect(processWhatsAppInboundMessage).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      processed: 2,
      statusesProcessed: 1,
      inboundProcessed: 1,
    });
  });

  it("extracts supported interactive reply titles without storing raw provider payloads", async () => {
    const req = makeRequest({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "123456789" },
            messages: [{
              from: "2348012345678",
              id: "wamid.inbound.003",
              type: "interactive",
              interactive: {
                button_reply: {
                  id: "request_quote",
                  title: "Request a quote",
                },
              },
            }],
          },
        }],
      }],
    });

    const res = makeResponse();

    await handleWhatsAppWebhook(req, res);

    expect(processWhatsAppInboundMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "Request a quote",
        messageType: "interactive",
      }),
    );
  });

  it("rejects requests with an invalid signature", async () => {
    const req = makeRequest({ entry: [] });
    req.get.mockReturnValue("sha256=invalid");

    const res = makeResponse();

    await handleWhatsAppWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(processWhatsAppInboundMessage).not.toHaveBeenCalled();
    expect(processWhatsAppWebhookEvent).not.toHaveBeenCalled();
  });

  it("returns a retryable server error when inbound processing fails", async () => {
    processWhatsAppInboundMessage.mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const req = makeRequest({
      entry: [{
        changes: [{
          value: {
            metadata: { phone_number_id: "123456789" },
            messages: [{
              from: "2348012345678",
              id: "wamid.inbound.004",
              type: "text",
              text: { body: "Please call me." },
            }],
          },
        }],
      }],
    });

    const res = makeResponse();
    const originalError = console.error;
    console.error = vi.fn();

    try {
      await handleWhatsAppWebhook(req, res);
    } finally {
      console.error = originalError;
    }

    expect(res.status).toHaveBeenCalledWith(500);
    expect(processWhatsAppInboundMessage).toHaveBeenCalledTimes(1);
  });

  it("keeps malformed top-level event structures rejected", async () => {
    const req = makeRequest({ object: "whatsapp_business_account" });
    const res = makeResponse();

    await handleWhatsAppWebhook(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(processWhatsAppInboundMessage).not.toHaveBeenCalled();
  });
});
