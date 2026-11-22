import pool from "../config/database.js";
import {
  encryptWhatsAppToken,
  decryptWhatsAppToken,
} from "../utils/whatsapp-token-encryption.js";

function validateIdentifiers(businessId, channelConnectionId) {
  if (
    businessId === undefined ||
    businessId === null ||
    !/^[1-9]\d*$/.test(String(businessId))
  ) {
    throw new Error("A valid business ID is required.");
  }

  if (
    channelConnectionId === undefined ||
    channelConnectionId === null ||
    !/^[1-9]\d*$/.test(String(channelConnectionId))
  ) {
    throw new Error("A valid channel connection ID is required.");
  }
}

export async function saveWhatsAppCredentials(
  { businessId, channelConnectionId, accessToken },
  db = pool,
) {
  validateIdentifiers(businessId, channelConnectionId);

  const encrypted = encryptWhatsAppToken(accessToken);

  const result = await db.query(
    `
      INSERT INTO business_communication_channel_credentials (
        business_id,
        channel_connection_id,
        access_token_ciphertext,
        access_token_iv,
        access_token_auth_tag,
        encryption_key_version
      )
      SELECT
        channel.business_id,
        channel.id,
        $3,
        $4,
        $5,
        $6
      FROM business_communication_channels AS channel
      WHERE channel.business_id = $1
        AND channel.id = $2
        AND channel.channel = 'whatsapp'
        AND channel.provider = 'meta_whatsapp'
        AND channel.connection_status = 'connected'
        AND channel.is_active = TRUE
      ON CONFLICT (business_id, channel_connection_id)
      DO UPDATE SET
        access_token_ciphertext = EXCLUDED.access_token_ciphertext,
        access_token_iv = EXCLUDED.access_token_iv,
        access_token_auth_tag = EXCLUDED.access_token_auth_tag,
        encryption_key_version = EXCLUDED.encryption_key_version,
        updated_at = NOW()
      RETURNING business_id, channel_connection_id
    `,
    [
      String(businessId),
      String(channelConnectionId),
      encrypted.accessTokenCiphertext,
      encrypted.accessTokenIv,
      encrypted.accessTokenAuthTag,
      encrypted.encryptionKeyVersion,
    ],
  );

  if (result.rowCount !== 1) {
    throw new Error(
      "An active Meta WhatsApp connection for this business is required.",
    );
  }

  return {
    businessId: String(result.rows[0].business_id),
    channelConnectionId: String(result.rows[0].channel_connection_id),
    saved: true,
  };
}

export async function getWhatsAppCredentials(
  { businessId, channelConnectionId },
  db = pool,
) {
  validateIdentifiers(businessId, channelConnectionId);

  const result = await db.query(
    `
      SELECT
        credentials.access_token_ciphertext,
        credentials.access_token_iv,
        credentials.access_token_auth_tag,
        credentials.encryption_key_version,
        channel.external_account_id,
        channel.external_channel_id,
        channel.address
      FROM business_communication_channel_credentials AS credentials
      INNER JOIN business_communication_channels AS channel
        ON channel.business_id = credentials.business_id
       AND channel.id = credentials.channel_connection_id
      WHERE credentials.business_id = $1
        AND credentials.channel_connection_id = $2
        AND channel.channel = 'whatsapp'
        AND channel.provider = 'meta_whatsapp'
        AND channel.connection_status = 'connected'
        AND channel.is_active = TRUE
      LIMIT 1
    `,
    [String(businessId), String(channelConnectionId)],
  );

  if (result.rowCount !== 1) {
    return null;
  }

  const row = result.rows[0];

  const accessToken = decryptWhatsAppToken({
    accessTokenCiphertext: row.access_token_ciphertext,
    accessTokenIv: row.access_token_iv,
    accessTokenAuthTag: row.access_token_auth_tag,
    encryptionKeyVersion: row.encryption_key_version,
  });

  return {
    accessToken,
    businessAccountId: row.external_account_id,
    phoneNumberId: row.external_channel_id,
    displayNumber: row.address,
  };
}

export async function deleteWhatsAppCredentials(
  { businessId, channelConnectionId },
  db = pool,
) {
  validateIdentifiers(businessId, channelConnectionId);

  const result = await db.query(
    `
      DELETE FROM business_communication_channel_credentials
      WHERE business_id = $1
        AND channel_connection_id = $2
      RETURNING business_id, channel_connection_id
    `,
    [String(businessId), String(channelConnectionId)],
  );

  return {
    deleted: result.rowCount === 1,
  };
}
