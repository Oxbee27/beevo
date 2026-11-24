import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { pool, client } = vi.hoisted(() => {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  };

  return {
    client,
    pool: {
      connect: vi.fn(),
      query: vi.fn(),
    },
  };
});

vi.mock("../src/config/database.js", () => ({
  default: pool,
}));

vi.mock("../src/services/meta-embedded-signup-state.service.js", () => ({
  consumeMetaEmbeddedSignupState: vi.fn(),
}));

vi.mock("../src/services/meta-whatsapp-api.service.js", () => ({
  exchangeMetaAuthorizationCode: vi.fn(),
  verifyMetaWhatsAppAssets: vi.fn(),
  subscribeMetaWhatsAppAppToWaba: vi.fn(),
  registerMetaWhatsAppPhoneNumber: vi.fn(),
}));

vi.mock("../src/services/whatsapp-credentials.service.js", () => ({
  saveWhatsAppCredentials: vi.fn(),
}));

import {
  completeMetaWhatsAppEmbeddedSignup,
} from "../src/services/meta-whatsapp-connection.service.js";
import {
  consumeMetaEmbeddedSignupState,
} from "../src/services/meta-embedded-signup-state.service.js";
import {
  exchangeMetaAuthorizationCode,
  verifyMetaWhatsAppAssets,
  subscribeMetaWhatsAppAppToWaba,
  registerMetaWhatsAppPhoneNumber,
} from "../src/services/meta-whatsapp-api.service.js";
import {
  saveWhatsAppCredentials,
} from "../src/services/whatsapp-credentials.service.js";

const signupInput = {
  businessId: 7,
  userId: 11,
  state: "a".repeat(64),
  code: "meta-authorization-code",
  businessAccountId: "123456789",
  phoneNumberId: "987654321",
  pin: "123456",
};

const authorization = {
  accessToken: "secret-meta-access-token",
  tokenType: "bearer",
  expiresIn: 3600,
};

const verifiedAssets = {
  businessAccountId: "123456789",
  businessAccountName: "Example Business",
  phoneNumberId: "987654321",
  displayNumber: "+2348012345678",
  verifiedName: "Example Store",
};

function configureSuccessfulDatabase() {
  client.query
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
    .mockResolvedValueOnce({
      rows: [{ id: "7" }],
      rowCount: 1,
    }) // Lock business
    .mockResolvedValueOnce({
      rows: [],
      rowCount: 0,
    }) // No other active WhatsApp number
    .mockResolvedValueOnce({
      rows: [{
        id: "22",
        business_id: "7",
      }],
      rowCount: 1,
    }) // Insert/update channel
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT

  pool.connect.mockResolvedValue(client);

  consumeMetaEmbeddedSignupState.mockResolvedValue({
    businessId: "7",
    userId: "11",
    consumedAt: new Date().toISOString(),
  });

  exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
  verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
  saveWhatsAppCredentials.mockResolvedValue({
    businessId: "7",
    channelConnectionId: "22",
    saved: true,
  });
}

describe("Meta WhatsApp connection service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pool.connect.mockResolvedValue(client);
    pool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    subscribeMetaWhatsAppAppToWaba.mockResolvedValue({ subscribed: true });
    registerMetaWhatsAppPhoneNumber.mockResolvedValue({ registered: true });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("consumes state, verifies Meta assets, and saves the connection transactionally", async () => {
    configureSuccessfulDatabase();

    const result = await completeMetaWhatsAppEmbeddedSignup(signupInput);

    expect(consumeMetaEmbeddedSignupState).toHaveBeenCalledWith(
      signupInput.state,
      signupInput.businessId,
      signupInput.userId,
      pool,
    );

    expect(exchangeMetaAuthorizationCode).toHaveBeenCalledWith({
      code: signupInput.code,
      fetchImpl: globalThis.fetch,
      env: process.env,
    });

    expect(verifyMetaWhatsAppAssets).toHaveBeenCalledWith({
      accessToken: authorization.accessToken,
      businessAccountId: signupInput.businessAccountId,
      phoneNumberId: signupInput.phoneNumberId,
      fetchImpl: globalThis.fetch,
      env: process.env,
    });

    expect(subscribeMetaWhatsAppAppToWaba).toHaveBeenCalledWith({
      accessToken: authorization.accessToken,
      businessAccountId: verifiedAssets.businessAccountId,
      fetchImpl: globalThis.fetch,
      env: process.env,
    });

    expect(registerMetaWhatsAppPhoneNumber).toHaveBeenCalledWith({
      accessToken: authorization.accessToken,
      phoneNumberId: verifiedAssets.phoneNumberId,
      pin: signupInput.pin,
      fetchImpl: globalThis.fetch,
      env: process.env,
    });

    expect(
      subscribeMetaWhatsAppAppToWaba.mock.invocationCallOrder[0],
    ).toBeLessThan(
      registerMetaWhatsAppPhoneNumber.mock.invocationCallOrder[0],
    );

    expect(
      registerMetaWhatsAppPhoneNumber.mock.invocationCallOrder[0],
    ).toBeLessThan(pool.connect.mock.invocationCallOrder[0]);

    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]))
      .toEqual(["BEGIN", "SELECT", "SELECT", "INSERT", "COMMIT"]);

    expect(saveWhatsAppCredentials).toHaveBeenCalledWith(
      {
        businessId: "7",
        channelConnectionId: "22",
        accessToken: authorization.accessToken,
      },
      client,
    );

    expect(result).toEqual({
      businessId: "7",
      channelConnectionId: "22",
      status: "connected",
      displayNumber: "+2348012345678",
      businessAccountId: "123456789",
      phoneNumberId: "987654321",
      verifiedName: "Example Store",
    });

    expect(result).not.toHaveProperty("accessToken");
    expect(JSON.stringify(result)).not.toContain(authorization.accessToken);
  });

  it("rejects an invalid registration PIN before consuming signup state", async () => {
    await expect(
      completeMetaWhatsAppEmbeddedSignup({
        ...signupInput,
        pin: "12345",
      }),
    ).rejects.toThrow("exactly six digits");

    expect(consumeMetaEmbeddedSignupState).not.toHaveBeenCalled();
    expect(exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
    expect(subscribeMetaWhatsAppAppToWaba).not.toHaveBeenCalled();
    expect(registerMetaWhatsAppPhoneNumber).not.toHaveBeenCalled();
  });

  it("does not call Meta when the signup state is invalid", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue(null);

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("invalid or has expired");

    expect(exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
    expect(verifyMetaWhatsAppAssets).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("does not exchange a code when the input identifiers are malformed", async () => {
    await expect(
      completeMetaWhatsAppEmbeddedSignup({
        ...signupInput,
        phoneNumberId: "not-a-meta-id",
      }),
    ).rejects.toThrow("valid WhatsApp phone number ID");

    expect(consumeMetaEmbeddedSignupState).not.toHaveBeenCalled();
    expect(exchangeMetaAuthorizationCode).not.toHaveBeenCalled();
  });

  it("does not open a transaction when Meta rejects the authorization code", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });

    exchangeMetaAuthorizationCode.mockRejectedValue(
      new Error("Meta rejected the WhatsApp integration request."),
    );

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("Meta rejected");

    expect(verifyMetaWhatsAppAssets).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it("does not save anything when the phone number cannot be verified", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });

    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockRejectedValue(
      new Error("The selected phone number does not belong to the verified WhatsApp Business Account."),
    );

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("does not belong");

    expect(pool.connect).not.toHaveBeenCalled();
    expect(saveWhatsAppCredentials).not.toHaveBeenCalled();
  });

  it("does not register or save a connection when WABA subscription fails", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });
    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
    subscribeMetaWhatsAppAppToWaba.mockRejectedValue(
      new Error("Meta rejected the subscription request."),
    );

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("subscription");

    expect(registerMetaWhatsAppPhoneNumber).not.toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
    expect(saveWhatsAppCredentials).not.toHaveBeenCalled();
  });

  it("does not save a connection when phone registration fails", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });
    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
    registerMetaWhatsAppPhoneNumber.mockRejectedValue(
      new Error("Meta rejected the registration request."),
    );

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("registration");

    expect(subscribeMetaWhatsAppAppToWaba).toHaveBeenCalled();
    expect(pool.connect).not.toHaveBeenCalled();
    expect(saveWhatsAppCredentials).not.toHaveBeenCalled();
  });

  it("rolls back when another WhatsApp number is already active", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });

    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
    subscribeMetaWhatsAppAppToWaba.mockResolvedValue({ subscribed: true });
    registerMetaWhatsAppPhoneNumber.mockResolvedValue({ registered: true });

    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "7" }],
        rowCount: 1,
      }) // Lock business
      .mockResolvedValueOnce({
        rows: [{ id: "19" }],
        rowCount: 1,
      }) // Existing active number
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("different WhatsApp number is already connected");

    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]))
      .toEqual(["BEGIN", "SELECT", "SELECT", "ROLLBACK"]);

    expect(saveWhatsAppCredentials).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back the channel write when encrypted credential storage fails", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });

    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
    subscribeMetaWhatsAppAppToWaba.mockResolvedValue({ subscribed: true });
    registerMetaWhatsAppPhoneNumber.mockResolvedValue({ registered: true });

    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: "7" }],
        rowCount: 1,
      }) // Lock business
      .mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      }) // No other active number
      .mockResolvedValueOnce({
        rows: [{ id: "22", business_id: "7" }],
        rowCount: 1,
      }) // Channel insert
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

    saveWhatsAppCredentials.mockRejectedValue(
      new Error("Credential encryption failed."),
    );

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("Credential encryption failed");

    expect(client.query.mock.calls.map(([sql]) => sql.trim().split(/\s+/)[0]))
      .toEqual(["BEGIN", "SELECT", "SELECT", "INSERT", "ROLLBACK"]);

    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rolls back when the business row cannot be locked", async () => {
    consumeMetaEmbeddedSignupState.mockResolvedValue({
      businessId: "7",
      userId: "11",
    });

    exchangeMetaAuthorizationCode.mockResolvedValue(authorization);
    verifyMetaWhatsAppAssets.mockResolvedValue(verifiedAssets);
    subscribeMetaWhatsAppAppToWaba.mockResolvedValue({ subscribed: true });
    registerMetaWhatsAppPhoneNumber.mockResolvedValue({ registered: true });

    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // Business missing
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK

    await expect(
      completeMetaWhatsAppEmbeddedSignup(signupInput),
    ).rejects.toThrow("business account could not be verified");

    expect(saveWhatsAppCredentials).not.toHaveBeenCalled();
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects an invalid authenticated business ID before consuming state", async () => {
    await expect(
      completeMetaWhatsAppEmbeddedSignup({
        ...signupInput,
        businessId: "invalid",
      }),
    ).rejects.toThrow("valid business ID");

    expect(consumeMetaEmbeddedSignupState).not.toHaveBeenCalled();
  });

  it("rejects an invalid authenticated user ID before consuming state", async () => {
    await expect(
      completeMetaWhatsAppEmbeddedSignup({
        ...signupInput,
        userId: 0,
      }),
    ).rejects.toThrow("valid user ID");

    expect(consumeMetaEmbeddedSignupState).not.toHaveBeenCalled();
  });
});
