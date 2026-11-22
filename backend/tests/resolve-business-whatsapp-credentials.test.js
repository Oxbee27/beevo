import { describe, it, expect, vi, beforeEach } from "vitest";

const { decryptWhatsAppToken } = vi.hoisted(() => ({
  decryptWhatsAppToken: vi.fn(() => "decrypted-token"),
}));

vi.mock("../src/utils/whatsapp-token-encryption.js", () => ({
  decryptWhatsAppToken,
}));

import { resolveBusinessWhatsAppCredentials } from "../src/services/resolve-business-whatsapp-credentials.service.js";

const valid = {
  channel_connection_id: "12",
  external_account_id: "waba-123",
  external_channel_id: "123456789012345",
  address: "+2348012345678",
  access_token_ciphertext: "encrypted",
  access_token_iv: "123456789012",
  access_token_auth_tag: "1234567890123456",
  encryption_key_version: 1,
};

const dbWith = (rows) => ({
  query: vi.fn(async () => ({ rows })),
});

describe("resolveBusinessWhatsAppCredentials", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns not_connected when no active connection exists", async () => {
    const db = dbWith([]);
    await expect(resolveBusinessWhatsAppCredentials({ businessId: 7 }, db))
      .resolves.toEqual({ status: "not_connected", credentials: null });
  });

  it("rejects multiple active connections", async () => {
    const db = dbWith([valid, { ...valid, channel_connection_id: "13" }]);
    await expect(resolveBusinessWhatsAppCredentials({ businessId: 7 }, db))
      .resolves.toEqual({ status: "ambiguous", credentials: null });
    expect(decryptWhatsAppToken).not.toHaveBeenCalled();
  });

  it("decrypts credentials for one valid connection", async () => {
    const db = dbWith([valid]);
    await expect(resolveBusinessWhatsAppCredentials({ businessId: 7 }, db))
      .resolves.toMatchObject({
        status: "ready",
        credentials: {
          channelConnectionId: "12",
          accessToken: "decrypted-token",
          businessAccountId: "waba-123",
          phoneNumberId: "123456789012345",
        },
      });
  });

  it("rejects a connection without credentials", async () => {
    const db = dbWith([{
      ...valid,
      access_token_ciphertext: null,
      access_token_iv: null,
      access_token_auth_tag: null,
    }]);
    await expect(resolveBusinessWhatsAppCredentials({ businessId: 7 }, db))
      .resolves.toEqual({
        status: "credentials_unavailable",
        credentials: null,
      });
    expect(decryptWhatsAppToken).not.toHaveBeenCalled();
  });

  it("rejects invalid business IDs", async () => {
    const db = dbWith([]);
    await expect(resolveBusinessWhatsAppCredentials(
      { businessId: "invalid" }, db,
    )).rejects.toThrow("A valid business ID is required.");
    expect(db.query).not.toHaveBeenCalled();
  });
});
