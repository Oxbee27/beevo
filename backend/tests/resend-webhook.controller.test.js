import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const { verifyWebhook, processEvent } = vi.hoisted(() => ({
  verifyWebhook: vi.fn(),
  processEvent: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: vi.fn(function () {
    this.webhooks = { verify: verifyWebhook };
  }),
}));

vi.mock("../src/services/process-resend-webhook.service.js", () => ({
  processResendWebhookEvent: processEvent,
}));

import app from "../src/app.js";

describe("Resend webhook endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = "whsec_test_secret";
    verifyWebhook.mockReturnValue({
      type: "email.delivered",
      data: { email_id: "resend-email-101" },
    });
    processEvent.mockResolvedValue({ status: "matched" });
  });

  it("verifies the raw body and processes a valid event", async () => {
    const rawBody = JSON.stringify({ type: "email.delivered" });

    const response = await request(app)
      .post("/webhooks/resend")
      .set("Content-Type", "application/json")
      .set("svix-id", "evt_101")
      .set("svix-timestamp", "1794300000")
      .set("svix-signature", "v1,test-signature")
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(verifyWebhook).toHaveBeenCalledWith({
      payload: rawBody,
      headers: {
        id: "evt_101",
        timestamp: "1794300000",
        signature: "v1,test-signature",
      },
      webhookSecret: "whsec_test_secret",
    });
    expect(processEvent).toHaveBeenCalledWith({
      eventId: "evt_101",
      event: {
        type: "email.delivered",
        data: { email_id: "resend-email-101" },
      },
    });
  });

  it("rejects missing signature headers", async () => {
    const response = await request(app)
      .post("/webhooks/resend")
      .set("Content-Type", "application/json")
      .send(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(400);
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature", async () => {
    verifyWebhook.mockImplementation(() => {
      throw new Error("Invalid signature");
    });

    const response = await request(app)
      .post("/webhooks/resend")
      .set("Content-Type", "application/json")
      .set("svix-id", "evt_invalid")
      .set("svix-timestamp", "1794300000")
      .set("svix-signature", "invalid")
      .send(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects events when webhook verification is not configured", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;

    const response = await request(app)
      .post("/webhooks/resend")
      .set("Content-Type", "application/json")
      .set("svix-id", "evt_unconfigured")
      .set("svix-timestamp", "1794300000")
      .set("svix-signature", "signature")
      .send(JSON.stringify({ type: "email.delivered" }));

    expect(response.status).toBe(503);
    expect(verifyWebhook).not.toHaveBeenCalled();
    expect(processEvent).not.toHaveBeenCalled();
  });
});
