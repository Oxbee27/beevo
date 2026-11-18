import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import request from "supertest";

const { verifyFunding } = vi.hoisted(() => ({
  verifyFunding: vi.fn(),
}));

vi.mock("../src/services/verify-wallet-funding.service.js", () => ({
  verifyWalletFunding: verifyFunding,
}));

import app from "../src/app.js";

const secret = "paystack-webhook-test-secret";

function signatureFor(body) {
  return createHmac("sha512", secret)
    .update(Buffer.from(body))
    .digest("hex");
}

function walletFundingEvent(overrides = {}) {
  return {
    event: "charge.success",
    data: {
      reference: "BEEVO-12345678",
      metadata: {
        purpose: "beevo_wallet_funding",
        business_id: "7",
      },
      ...overrides,
    },
  };
}

describe("Paystack wallet funding webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYSTACK_SECRET_KEY = secret;
    verifyFunding.mockResolvedValue({
      reference: "BEEVO-12345678",
      alreadyCredited: false,
    });
  });

  it("validates the signature and verifies successful wallet funding", async () => {
    const rawBody = JSON.stringify(walletFundingEvent());

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("processed");
    expect(verifyFunding).toHaveBeenCalledWith(
      "7",
      "BEEVO-12345678",
    );
  });

  it("rejects an invalid signature", async () => {
    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", "invalid")
      .send(JSON.stringify(walletFundingEvent()));

    expect(response.status).toBe(400);
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("rejects requests when Paystack verification is not configured", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .send(JSON.stringify(walletFundingEvent()));

    expect(response.status).toBe(503);
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON even when the signature is valid", async () => {
    const rawBody = "{invalid-json";

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(400);
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("acknowledges unrelated Paystack events without processing them", async () => {
    const rawBody = JSON.stringify({
      event: "transfer.success",
      data: {},
    });

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ignored");
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("ignores successful payments that are not Beevo wallet funding", async () => {
    const rawBody = JSON.stringify(
      walletFundingEvent({
        metadata: {
          purpose: "other_payment",
          business_id: "7",
        },
      }),
    );

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ignored");
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("does not process an event with an invalid business ID", async () => {
    const rawBody = JSON.stringify(
      walletFundingEvent({
        metadata: {
          purpose: "beevo_wallet_funding",
          business_id: "7 OR 1=1",
        },
      }),
    );

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("ignored");
    expect(verifyFunding).not.toHaveBeenCalled();
  });

  it("reports an already credited payment without creating another credit", async () => {
    verifyFunding.mockResolvedValue({
      reference: "BEEVO-12345678",
      alreadyCredited: true,
    });

    const rawBody = JSON.stringify(walletFundingEvent());

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe("already_processed");
    expect(verifyFunding).toHaveBeenCalledTimes(1);
  });

  it("passes verification failures to the central error handler", async () => {
    verifyFunding.mockRejectedValue(
      Object.assign(new Error("Provider unavailable"), {
        status: 503,
        publicMessage: "Payment verification is temporarily unavailable.",
      }),
    );

    const rawBody = JSON.stringify(walletFundingEvent());

    const response = await request(app)
      .post("/webhooks/paystack")
      .set("Content-Type", "application/json")
      .set("x-paystack-signature", signatureFor(rawBody))
      .send(rawBody);

    expect(response.status).toBe(503);
    expect(response.body.message).toBe(
      "Payment verification is temporarily unavailable.",
    );
  });
});
