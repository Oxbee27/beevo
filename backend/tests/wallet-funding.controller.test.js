import { beforeEach, describe, expect, it, vi } from "vitest";

const { initializeWalletFunding } = vi.hoisted(() => ({
  initializeWalletFunding: vi.fn(),
}));

vi.mock("../src/services/initialize-wallet-funding.service.js", () => ({
  initializeWalletFunding,
}));

import { initializeWalletFundingController } from "../src/controllers/initialize-wallet-funding.controller.js";

function createResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("wallet funding controller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("initializes checkout for the authenticated business owner", async () => {
    initializeWalletFunding.mockResolvedValue({
      reference: "BEEVO-reference",
      amountKobo: "250000",
      currency: "NGN",
      authorizationUrl: "https://checkout.paystack.com/example",
      accessCode: "access-code",
      alreadyInitialized: false,
    });

    const req = {
      user: { id: "7", businessId: "7" },
      body: {
        amountKobo: "250000",
        idempotencyKey: "funding-request-123",
      },
    };
    const res = createResponse();

    await initializeWalletFundingController(req, res, vi.fn());

    expect(initializeWalletFunding).toHaveBeenCalledWith(
      "7",
      "7",
      req.body,
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: {
          checkout: expect.objectContaining({
            reference: "BEEVO-reference",
          }),
        },
      }),
    );
  });

  it("rejects invalid input without calling the service", async () => {
    const req = {
      user: { id: "7", businessId: "7" },
      body: { amountKobo: "invalid" },
    };
    const res = createResponse();

    await initializeWalletFundingController(req, res, vi.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect(initializeWalletFunding).not.toHaveBeenCalled();
  });

  it("passes service errors to the error handler", async () => {
    const error = new Error("Service failure");
    initializeWalletFunding.mockRejectedValue(error);

    const req = {
      user: { id: "7", businessId: "7" },
      body: {
        amountKobo: "250000",
        idempotencyKey: "funding-request-123",
      },
    };
    const next = vi.fn();

    await initializeWalletFundingController(req, createResponse(), next);

    expect(next).toHaveBeenCalledWith(error);
  });
});
