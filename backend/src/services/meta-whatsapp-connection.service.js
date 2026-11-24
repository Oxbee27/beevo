import pool from "../config/database.js";
import {
  consumeMetaEmbeddedSignupState,
} from "./meta-embedded-signup-state.service.js";
import {
  exchangeMetaAuthorizationCode,
  verifyMetaWhatsAppAssets,
  subscribeMetaWhatsAppAppToWaba,
  registerMetaWhatsAppPhoneNumber,
} from "./meta-whatsapp-api.service.js";
import {
  saveWhatsAppCredentials,
} from "./whatsapp-credentials.service.js";

function validateAuthenticatedIds(businessId, userId) {
  if (
    businessId === undefined ||
    businessId === null ||
    !/^[1-9]\d*$/.test(String(businessId))
  ) {
    throw new Error("A valid business ID is required.");
  }

  if (
    userId === undefined ||
    userId === null ||
    !/^[1-9]\d*$/.test(String(userId))
  ) {
    throw new Error("A valid user ID is required.");
  }
}

function validateSignupInput({
  state,
  code,
  businessAccountId,
  phoneNumberId,
  pin,
}) {
  if (typeof state !== "string" || !/^[a-f0-9]{64}$/.test(state)) {
    throw new Error("A valid WhatsApp signup state is required.");
  }

  if (
    typeof code !== "string" ||
    code.trim().length === 0 ||
    code.length > 4096
  ) {
    throw new Error("A valid Meta authorization code is required.");
  }

  if (
    typeof businessAccountId !== "string" ||
    !/^\d{1,40}$/.test(businessAccountId)
  ) {
    throw new Error("A valid WhatsApp Business Account ID is required.");
  }

  if (
    typeof phoneNumberId !== "string" ||
    !/^\d{1,40}$/.test(phoneNumberId)
  ) {
    throw new Error("A valid WhatsApp phone number ID is required.");
  }

  if (typeof pin !== "string" || !/^\d{6}$/.test(pin)) {
    throw new Error("The WhatsApp registration PIN must contain exactly six digits.");
  }
}

export async function completeMetaWhatsAppEmbeddedSignup({
  businessId,
  userId,
  state,
  code,
  businessAccountId,
  phoneNumberId,
  pin,
  db = pool,
  fetchImpl = globalThis.fetch,
  env = process.env,
}) {
  validateAuthenticatedIds(businessId, userId);

  validateSignupInput({
    state,
    code,
    businessAccountId,
    phoneNumberId,
    pin,
  });

  // Consume and commit the one-time state before making external requests.
  // The authenticated business and user IDs come from the server-side caller.
  const consumedState = await consumeMetaEmbeddedSignupState(
    state,
    businessId,
    userId,
    db,
  );

  if (!consumedState) {
    throw new Error(
      "This WhatsApp signup session is invalid or has expired. Please start again.",
    );
  }

  // Do not open a database transaction while waiting for Meta.
  const authorization = await exchangeMetaAuthorizationCode({
    code,
    fetchImpl,
    env,
  });

  const verifiedAssets = await verifyMetaWhatsAppAssets({
    accessToken: authorization.accessToken,
    businessAccountId,
    phoneNumberId,
    fetchImpl,
    env,
  });

  // Avoid registering a different number when this business already has
  // another active WhatsApp connection. The transaction below repeats
  // this check after acquiring the business lock to protect against races.
  const existingConnection = await db.query(
    `
      SELECT id
      FROM business_communication_channels
      WHERE business_id = $1
        AND channel = 'whatsapp'
        AND provider = 'meta_whatsapp'
        AND is_active = TRUE
        AND (
          external_channel_id IS DISTINCT FROM $2
          OR address <> $3
        )
      LIMIT 1
    `,
    [
      consumedState.businessId,
      verifiedAssets.phoneNumberId,
      verifiedAssets.displayNumber,
    ],
  );

  if (existingConnection.rowCount > 0) {
    throw new Error(
      "A different WhatsApp number is already connected to this business. Disconnect it before connecting another number.",
    );
  }

  await subscribeMetaWhatsAppAppToWaba({
    accessToken: authorization.accessToken,
    businessAccountId: verifiedAssets.businessAccountId,
    fetchImpl,
    env,
  });

  await registerMetaWhatsAppPhoneNumber({
    accessToken: authorization.accessToken,
    phoneNumberId: verifiedAssets.phoneNumberId,
    pin,
    fetchImpl,
    env,
  });

  const client = await db.connect();
  let transactionStarted = false;

  try {
    await client.query("BEGIN");
    transactionStarted = true;

    // Serialize connection attempts for this business.
    const businessResult = await client.query(
      `
        SELECT id
        FROM businesses
        WHERE id = $1
        FOR UPDATE
      `,
      [consumedState.businessId],
    );

    if (businessResult.rowCount !== 1) {
      throw new Error("The business account could not be verified.");
    }

    // Never silently replace a different active WhatsApp number.
    const activeConnectionResult = await client.query(
      `
        SELECT id
        FROM business_communication_channels
        WHERE business_id = $1
          AND channel = 'whatsapp'
          AND provider = 'meta_whatsapp'
          AND is_active = TRUE
          AND (
            external_channel_id IS DISTINCT FROM $2
            OR address <> $3
          )
        LIMIT 1
        FOR UPDATE
      `,
      [
        consumedState.businessId,
        verifiedAssets.phoneNumberId,
        verifiedAssets.displayNumber,
      ],
    );

    if (activeConnectionResult.rowCount > 0) {
      throw new Error(
        "A different WhatsApp number is already connected to this business. Disconnect it before connecting another number.",
      );
    }

    const channelResult = await client.query(
      `
        INSERT INTO business_communication_channels (
          business_id,
          channel,
          provider,
          display_name,
          address,
          external_account_id,
          external_channel_id,
          connection_status,
          is_active,
          verified_at,
          metadata
        )
        VALUES (
          $1,
          'whatsapp',
          'meta_whatsapp',
          $2,
          $3,
          $4,
          $5,
          'connected',
          TRUE,
          NOW(),
          $6::JSONB
        )
        ON CONFLICT (business_id, channel, provider, address)
        DO UPDATE SET
          display_name = EXCLUDED.display_name,
          external_account_id = EXCLUDED.external_account_id,
          external_channel_id = EXCLUDED.external_channel_id,
          connection_status = 'connected',
          is_active = TRUE,
          verified_at = NOW(),
          metadata = EXCLUDED.metadata,
          updated_at = NOW()
        RETURNING id, business_id
      `,
      [
        consumedState.businessId,
        verifiedAssets.verifiedName || verifiedAssets.businessAccountName,
        verifiedAssets.displayNumber,
        verifiedAssets.businessAccountId,
        verifiedAssets.phoneNumberId,
        JSON.stringify({
          integration: "meta_embedded_signup",
          businessAccountName: verifiedAssets.businessAccountName,
          verifiedName: verifiedAssets.verifiedName,
        }),
      ],
    );

    if (channelResult.rowCount !== 1) {
      throw new Error("The WhatsApp connection could not be saved.");
    }

    const channel = channelResult.rows[0];

    // This service encrypts the token before inserting it.
    // Passing the same transaction client keeps channel and credential writes atomic.
    await saveWhatsAppCredentials(
      {
        businessId: channel.business_id,
        channelConnectionId: channel.id,
        accessToken: authorization.accessToken,
      },
      client,
    );

    await client.query("COMMIT");
    transactionStarted = false;

    return {
      businessId: String(channel.business_id),
      channelConnectionId: String(channel.id),
      status: "connected",
      displayNumber: verifiedAssets.displayNumber,
      businessAccountId: verifiedAssets.businessAccountId,
      phoneNumberId: verifiedAssets.phoneNumberId,
      verifiedName: verifiedAssets.verifiedName,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original connection error.
      }
    }

    throw error;
  } finally {
    client.release();
  }
}
