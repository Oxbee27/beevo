import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_VERSION = 1;

function getEncryptionKey() {
  const configuredKey = process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY;

  if (
    typeof configuredKey !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(configuredKey)
  ) {
    throw new Error(
      "WhatsApp token encryption key must be configured as 64 hexadecimal characters."
    );
  }

  const key = Buffer.from(configuredKey, "hex");

  if (key.length !== 32) {
    throw new Error("Invalid WhatsApp token encryption key.");
  }

  return key;
}

export function encryptWhatsAppToken(accessToken) {
  if (typeof accessToken !== "string" || accessToken.trim().length === 0) {
    throw new Error("A valid WhatsApp access token is required.");
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return {
    accessTokenCiphertext: ciphertext.toString("base64"),
    accessTokenIv: iv.toString("base64"),
    accessTokenAuthTag: authTag.toString("base64"),
    encryptionKeyVersion: KEY_VERSION,
  };
}

export function decryptWhatsAppToken({
  accessTokenCiphertext,
  accessTokenIv,
  accessTokenAuthTag,
  encryptionKeyVersion = KEY_VERSION,
}) {
  if (encryptionKeyVersion !== KEY_VERSION) {
    throw new Error("Unsupported WhatsApp token encryption key version.");
  }

  if (
    typeof accessTokenCiphertext !== "string" ||
    accessTokenCiphertext.length === 0 ||
    typeof accessTokenIv !== "string" ||
    typeof accessTokenAuthTag !== "string"
  ) {
    throw new Error("Invalid encrypted WhatsApp token data.");
  }

  const iv = Buffer.from(accessTokenIv, "base64");
  const authTag = Buffer.from(accessTokenAuthTag, "base64");
  const ciphertext = Buffer.from(accessTokenCiphertext, "base64");

  if (
    iv.length !== IV_LENGTH ||
    authTag.length !== AUTH_TAG_LENGTH ||
    ciphertext.length === 0
  ) {
    throw new Error("Invalid encrypted WhatsApp token data.");
  }

  const key = getEncryptionKey();

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
