import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const encryptionKey = "a".repeat(64);

vi.mock("../src/config/database.js", () => ({
  default: { query: vi.fn() },
}));

import {
  deleteWhatsAppCredentials,
  getWhatsAppCredentials,
  saveWhatsAppCredentials,
} from "../src/services/whatsapp-credentials.service.js";
import pool from "../src/config/database.js";

const connection = {
  business_id: "7",
  id: "12",
  channel: "whatsapp",
  provider: "meta_whatsapp",
  connection_status: "connected",
  is_active: true,
  external_account_id: "waba-123",
  external_channel_id: "phone-456",
  address: "+2348012345678",
};

describe("WhatsApp credentials service", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_TOKEN_ENCRYPTION_KEY", encryptionKey);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("saves encrypted credentials for an active Meta connection", async () => {
    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ business_id: "7", channel_connection_id: "12" }],
    });

    const result = await saveWhatsAppCredentials({
      businessId: 7,
      channelConnectionId: 12,
      accessToken: "secret-meta-token",
    });

    expect(result).toEqual({
      businessId: "7",
      channelConnectionId: "12",
      saved: true,
    });

    const [sql, params] = pool.query.mock.calls[0];

    expect(sql).toContain("connection_status = 'connected'");
    expect(sql).toContain("channel.is_active = TRUE");
    expect(params).not.toContain("secret-meta-token");
    expect(params[2]).not.toBe("secret-meta-token");
  });

  it("retrieves and decrypts credentials for the requested connection", async () => {
    const { encryptWhatsAppToken } = await import(
      "../src/utils/whatsapp-token-encryption.js"
    );

    const encrypted = encryptWhatsAppToken("secret-meta-token");

    pool.query.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        access_token_ciphertext: encrypted.accessTokenCiphertext,
        access_token_iv: encrypted.accessTokenIv,
        access_token_auth_tag: encrypted.accessTokenAuthTag,
        encryption_key_version: encrypted.encryptionKeyVersion,
        external_account_id: connection.external_account_id,
        external_channel_id: connection.external_channel_id,
        address: connection.address,
      }],
    });

    const result = await getWhatsAppCredentials({
      businessId: 7,
      channelConnectionId: 12,
    });

    expect(result).toEqual({
      accessToken: "secret-meta-token",
      businessAccountId: "waba-123",
      phoneNumberId: "phone-456",
      displayNumber: "+2348012345678",
    });
  });

  it("does not retrieve credentials for another business", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await getWhatsAppCredentials({
      businessId: 8,
      channelConnectionId: 12,
    });

    expect(result).toBeNull();
    expect(pool.query.mock.calls[0][1]).toEqual(["8", "12"]);
  });

  it("refuses to save credentials for an inactive connection", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      saveWhatsAppCredentials({
        businessId: 7,
        channelConnectionId: 12,
        accessToken: "secret-token",
      }),
    ).rejects.toThrow("active Meta WhatsApp connection");
  });

  it("refuses to save credentials for a pending connection", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    await expect(
      saveWhatsAppCredentials({
        businessId: 7,
        channelConnectionId: 12,
        accessToken: "secret-token",
      }),
    ).rejects.toThrow("active Meta WhatsApp connection");
  });

  it("returns null when no credentials exist", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await getWhatsAppCredentials({
      businessId: 7,
      channelConnectionId: 12,
    });

    expect(result).toBeNull();
  });

  it("deletes credentials for the specified connection", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{}] });

    const result = await deleteWhatsAppCredentials({
      businessId: 7,
      channelConnectionId: 12,
    });

    expect(result).toEqual({ deleted: true });
    expect(pool.query.mock.calls[0][1]).toEqual(["7", "12"]);
  });

  it("does not report deletion for another tenant's connection", async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] });

    const result = await deleteWhatsAppCredentials({
      businessId: 8,
      channelConnectionId: 12,
    });

    expect(result).toEqual({ deleted: false });
  });

  it("rejects an invalid business ID", async () => {
    await expect(
      getWhatsAppCredentials({
        businessId: "invalid",
        channelConnectionId: 12,
      }),
    ).rejects.toThrow("valid business ID");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects an invalid connection ID", async () => {
    await expect(
      getWhatsAppCredentials({
        businessId: 7,
        channelConnectionId: "invalid",
      }),
    ).rejects.toThrow("valid channel connection ID");

    expect(pool.query).not.toHaveBeenCalled();
  });

  it("rejects empty access tokens before querying the database", async () => {
    await expect(
      saveWhatsAppCredentials({
        businessId: 7,
        channelConnectionId: 12,
        accessToken: "",
      }),
    ).rejects.toThrow();

    expect(pool.query).not.toHaveBeenCalled();
  });
});
