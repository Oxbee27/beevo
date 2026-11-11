import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";

const { processEvent } = vi.hoisted(() => ({
  processEvent: vi.fn(),
}));

vi.mock("../src/services/process-termii-webhook.service.js", () => ({
  processTermiiWebhookEvent: processEvent,
}));

import app from "../src/app.js";

const secret = "termii-webhook-test-secret";

function signatureFor(body) {
  return createHmac("sha512", secret)
    .update(Buffer.from(body))
    .digest("hex");
}

describe("Termii webhook endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TERMII_WEBHOOK_SECRET = secret;
    processEvent.mockResolvedValue({ status: "matched" });
  });

  it("verifies the signature and processes a valid raw payload", async () => {
    const rawBody = JSON.stringify({
      message_id: "termii-101",
      status: "Delivered",
    });

    const response = await request(app)
      .post("/webhooks/termii")
      .set("Content-Type", "application/json")
      .set("X-Termii-Signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(processEvent).toHaveBeenCalledWith({
      eventFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      event: {
        message_id: "termii-101",
        status: "Delivered",
      },
    });
  });

  it("rejects an invalid signature", async () => {
    const response = await request(app)
      .post("/webhooks/termii")
      .set("Content-Type", "application/json")
      .set("X-Termii-Signature", "invalid")
      .send(JSON.stringify({ status: "Delivered" }));

    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects requests when webhook verification is not configured", async () => {
    delete process.env.TERMII_WEBHOOK_SECRET;

    const response = await request(app)
      .post("/webhooks/termii")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ status: "Delivered" }));

    expect(response.status).toBe(503);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON even when its signature is valid", async () => {
    const rawBody = "{invalid-json";

    const response = await request(app)
      .post("/webhooks/termii")
      .set("Content-Type", "application/json")
      .set("X-Termii-Signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });
});
