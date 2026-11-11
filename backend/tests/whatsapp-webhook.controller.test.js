import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";

const { processEvent } = vi.hoisted(() => ({
  processEvent: vi.fn(),
}));

vi.mock("../src/services/process-whatsapp-webhook.service.js", () => ({
  processWhatsAppWebhookEvent: processEvent,
}));

import app from "../src/app.js";

const appSecret = "whatsapp-app-secret-test";
const verifyToken = "whatsapp-verify-token-test";

function signatureFor(body) {
  return `sha256=${createHmac("sha256", appSecret)
    .update(Buffer.from(body))
    .digest("hex")}`;
}

describe("WhatsApp webhook endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WHATSAPP_APP_SECRET = appSecret;
    process.env.WHATSAPP_VERIFY_TOKEN = verifyToken;
    processEvent.mockResolvedValue({ status: "matched" });
  });

  it("completes the Meta webhook verification handshake", async () => {
    const response = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": verifyToken,
        "hub.challenge": "beevo-verification-challenge",
      });

    expect(response.status).toBe(200);
    expect(response.text).toBe("beevo-verification-challenge");
  });

  it("rejects an incorrect verification token", async () => {
    const response = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "incorrect-token",
        "hub.challenge": "challenge",
      });

    expect(response.status).toBe(403);
  });

  it("processes a valid signed WhatsApp delivery event", async () => {
    const rawBody = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.test-101",
              status: "delivered",
              timestamp: "1794400000",
              recipient_id: "2348012345678",
            }],
          },
        }],
      }],
    });

    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, processed: 1 });
    expect(processEvent).toHaveBeenCalledWith({
      eventFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      event: {
        id: "wamid.test-101",
        status: "delivered",
        timestamp: "1794400000",
        recipient_id: "2348012345678",
      },
    });
  });

  it("rejects an invalid signature", async () => {
    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", "sha256=invalid")
      .send(JSON.stringify({ entry: [] }));

    expect(response.status).toBe(401);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects requests when the app secret is missing", async () => {
    delete process.env.WHATSAPP_APP_SECRET;

    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ entry: [] }));

    expect(response.status).toBe(500);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON even when its signature is valid", async () => {
    const rawBody = "{invalid-json";

    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("X-Hub-Signature-256", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
