import { beforeEach, describe, expect, it, vi } from "vitest";

const { completeSignupMock } = vi.hoisted(() => ({
  completeSignupMock: vi.fn(),
}));

vi.mock("../src/services/meta-whatsapp-connection.service.js", () => ({
  completeMetaWhatsAppEmbeddedSignup: completeSignupMock,
}));

import {
  completeMetaWhatsAppEmbeddedSignupController,
} from "../src/controllers/meta-whatsapp-embedded-signup.controller.js";

function createResponse() {
  const res = {
    status: vi.fn(),
    json: vi.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);

  return res;
}

describe("Meta WhatsApp embedded signup completion controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes signup using authenticated business and user IDs", async () => {
    const safeConnection = {
      businessId: "12",
      channelConnectionId: "34",
      status: "connected",
      displayNumber: "+2348000000000",
      businessAccountId: "123456789",
      phoneNumberId: "987654321",
      verifiedName: "Example Business",
    };

    completeSignupMock.mockResolvedValue(safeConnection);

    const req = {
      user: { id: 7, businessId: 12 },
      body: {
        state: "a".repeat(64),
        code: "authorization-code",
        businessAccountId: "123456789",
        phoneNumberId: "987654321",
        pin: "123456",
        userId: 999,
        businessId: 999,
      },
    };
    const res = createResponse();

    await completeMetaWhatsAppEmbeddedSignupController(req, res);

    expect(completeSignupMock).toHaveBeenCalledWith({
      businessId: 12,
      userId: 7,
      state: "a".repeat(64),
      code: "authorization-code",
      businessAccountId: "123456789",
      phoneNumberId: "987654321",
      pin: "123456",
    });

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: "WhatsApp has been registered and connected successfully.",
      data: safeConnection,
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain("accessToken");
  });

  it("returns 400 for invalid signup input", async () => {
    completeSignupMock.mockRejectedValue(
      new Error("A valid Meta authorization code is required."),
    );

    const res = createResponse();

    await completeMetaWhatsAppEmbeddedSignupController(
      { user: { id: 7, businessId: 12 }, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "A valid Meta authorization code is required.",
    });
  });

  it("returns 400 when the signup state is invalid or expired", async () => {
    completeSignupMock.mockRejectedValue(
      new Error(
        "This WhatsApp signup session is invalid or has expired. Please start again.",
      ),
    );

    const res = createResponse();

    await completeMetaWhatsAppEmbeddedSignupController(
      { user: { id: 7, businessId: 12 }, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 409 when a different WhatsApp number is already connected", async () => {
    completeSignupMock.mockRejectedValue(
      new Error(
        "A different WhatsApp number is already connected to this business. Disconnect it before connecting another number.",
      ),
    );

    const res = createResponse();

    await completeMetaWhatsAppEmbeddedSignupController(
      { user: { id: 7, businessId: 12 }, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(409);
  });

  it("hides unexpected provider and database error details", async () => {
    completeSignupMock.mockRejectedValue(
      new Error("Sensitive provider response containing secret details"),
    );

    const res = createResponse();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await completeMetaWhatsAppEmbeddedSignupController(
      { user: { id: 7, businessId: 12 }, body: {} },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: "Unable to complete WhatsApp setup. Please try again.",
    });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain(
      "Sensitive provider response",
    );

    consoleError.mockRestore();
  });
});
