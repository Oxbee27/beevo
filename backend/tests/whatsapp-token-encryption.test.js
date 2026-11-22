import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  decryptWhatsAppToken,
  encryptWhatsAppToken,
} from "../src/utils/whatsapp-token-encryption.js";

const ENV_KEY = "WHATSAPP_TOKEN_ENCRYPTION_KEY";
const ORIGINAL_KEY = process.env[ENV_KEY];

const TEST_KEY = "0123456789abcdef".repeat(4);
const TEST_TOKEN = "test-meta-whatsapp-access-token";

describe("WhatsApp token encryption", () => {
  beforeEach(() => {
    process.env[ENV_KEY] = TEST_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = ORIGINAL_KEY;
    }
  });

  it("encrypts a token without exposing the original plaintext", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);

    expect(encrypted.accessTokenCiphertext).not.toBe(TEST_TOKEN);
    expect(encrypted.accessTokenCiphertext).not.toContain(TEST_TOKEN);
    expect(encrypted.accessTokenIv).toBeTruthy();
    expect(encrypted.accessTokenAuthTag).toBeTruthy();
    expect(encrypted.encryptionKeyVersion).toBe(1);
  });

  it("decrypts an encrypted token back to its original value", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);

    expect(decryptWhatsAppToken(encrypted)).toBe(TEST_TOKEN);
  });

  it("uses a different random IV when encrypting the same token twice", () => {
    const first = encryptWhatsAppToken(TEST_TOKEN);
    const second = encryptWhatsAppToken(TEST_TOKEN);

    expect(first.accessTokenIv).not.toBe(second.accessTokenIv);
    expect(first.accessTokenCiphertext).not.toBe(
      second.accessTokenCiphertext
    );

    expect(decryptWhatsAppToken(first)).toBe(TEST_TOKEN);
    expect(decryptWhatsAppToken(second)).toBe(TEST_TOKEN);
  });

  it("rejects an empty token", () => {
    expect(() => encryptWhatsAppToken("")).toThrow(
      "A valid WhatsApp access token is required."
    );
  });

  it("rejects a missing encryption key", () => {
    delete process.env[ENV_KEY];

    expect(() => encryptWhatsAppToken(TEST_TOKEN)).toThrow(
      "WhatsApp token encryption key must be configured"
    );
  });

  it("rejects an incorrectly formatted encryption key", () => {
    process.env[ENV_KEY] = "not-a-valid-key";

    expect(() => encryptWhatsAppToken(TEST_TOKEN)).toThrow(
      "WhatsApp token encryption key must be configured"
    );
  });

  it("rejects a token encrypted with a different key", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);

    process.env[ENV_KEY] = "abcdef0123456789".repeat(4);

    expect(() => decryptWhatsAppToken(encrypted)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);
    const tampered = {
      ...encrypted,
      accessTokenCiphertext: Buffer.from(
        encrypted.accessTokenCiphertext,
        "base64"
      )
        .map((byte, index) => (index === 0 ? byte ^ 1 : byte))
        .toString("base64"),
    };

    expect(() => decryptWhatsAppToken(tampered)).toThrow();
  });

  it("rejects tampered authentication tags", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);
    const tampered = {
      ...encrypted,
      accessTokenAuthTag: Buffer.alloc(16, 0).toString("base64"),
    };

    expect(() => decryptWhatsAppToken(tampered)).toThrow();
  });

  it("rejects unsupported encryption key versions", () => {
    const encrypted = encryptWhatsAppToken(TEST_TOKEN);

    expect(() =>
      decryptWhatsAppToken({
        ...encrypted,
        encryptionKeyVersion: 2,
      })
    ).toThrow("Unsupported WhatsApp token encryption key version.");
  });

  it("rejects malformed encrypted data", () => {
    expect(() =>
      decryptWhatsAppToken({
        accessTokenCiphertext: "invalid",
        accessTokenIv: "invalid",
        accessTokenAuthTag: "invalid",
      })
    ).toThrow("Invalid encrypted WhatsApp token data.");
  });
});
