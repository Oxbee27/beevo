import pool from "../config/database.js";
import { decryptWhatsAppToken } from "../utils/whatsapp-token-encryption.js";

export async function resolveBusinessWhatsAppCredentials(
  { businessId },
  db = pool,
) {
  const normalizedBusinessId = Number(businessId);

  if (
    !Number.isSafeInteger(normalizedBusinessId) ||
    normalizedBusinessId <= 0
  ) {
    throw new Error("A valid business ID is required.");
  }

  const result = await db.query(
    `
      SELECT
        channel.id AS channel_connection_id,
        channel.external_account_id,
        channel.external_channel_id,
        channel.address,
        credentials.access_token_ciphertext AS access_token_ciphertext,
        credentials.access_token_iv AS access_token_iv,
        credentials.access_token_auth_tag AS access_token_auth_tag,
        credentials.encryption_key_version AS encryption_key_version
      FROM business_communication_channels AS channel
      LEFT JOIN business_communication_channel_credentials AS credentials
        ON credentials.business_id = channel.business_id
       AND credentials.channel_connection_id = channel.id
      WHERE channel.business_id = $1
        AND channel.channel = 'whatsapp'
        AND channel.provider = 'meta_whatsapp'
        AND channel.connection_status = 'connected'
        AND channel.is_active = TRUE
      ORDER BY channel.id ASC
    `,
    [normalizedBusinessId],
  );

  if (result.rows.length === 0) {
    return { status: "not_connected", credentials: null };
  }

  if (result.rows.length !== 1) {
    return { status: "ambiguous", credentials: null };
  }

  const connection = result.rows[0];

  if (
    !connection.access_token_ciphertext ||
    !connection.access_token_iv ||
    !connection.access_token_auth_tag ||
    !connection.external_channel_id ||
    !/^\d+$/.test(String(connection.external_channel_id)) ||
    !connection.external_account_id ||
    !connection.address
  ) {
    return { status: "credentials_unavailable", credentials: null };
  }

  const accessToken = decryptWhatsAppToken({
    accessTokenCiphertext: connection.access_token_ciphertext,
    accessTokenIv: connection.access_token_iv,
    accessTokenAuthTag: connection.access_token_auth_tag,
    encryptionKeyVersion: connection.encryption_key_version,
  });

  return {
    status: "ready",
    credentials: {
      channelConnectionId: String(connection.channel_connection_id),
      accessToken,
      businessAccountId: String(connection.external_account_id),
      phoneNumberId: String(connection.external_channel_id),
      displayNumber: String(connection.address),
    },
  };
}
