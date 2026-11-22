import pool from "../config/database.js";

function validateBusinessId(businessId) {
  if (
    businessId === undefined ||
    businessId === null ||
    !/^[1-9]\d*$/.test(String(businessId))
  ) {
    throw new Error("A valid business ID is required.");
  }
}

export async function getWhatsAppConnectionStatus(
  businessId,
  db = pool,
) {
  validateBusinessId(businessId);

  const result = await db.query(
    `
      SELECT
        id,
        display_name,
        address,
        connection_mode,
        connection_status,
        is_active,
        verified_at,
        updated_at
      FROM business_communication_channels
      WHERE business_id = $1
        AND channel = 'whatsapp'
        AND provider = 'meta_whatsapp'
      ORDER BY is_active DESC, updated_at DESC, id DESC
    `,
    [String(businessId)],
  );

  const active = result.rows.filter((row) => row.is_active);

  if (active.length > 1) {
    return {
      status: "ambiguous",
      connected: false,
      message: "More than one WhatsApp connection is active. Please contact support.",
      connection: null,
    };
  }

  if (active.length === 1) {
    const row = active[0];

    return {
      status: row.connection_status === "connected"
        ? "connected"
        : "needs_attention",
      connected: row.connection_status === "connected",
      connection: {
        id: String(row.id),
        displayName: row.display_name,
        displayNumber: row.address,
        connectionMode: row.connection_mode,
        verifiedAt: row.verified_at,
      },
    };
  }

  const latest = result.rows[0];

  return {
    status: latest?.connection_status === "pending"
      ? "pending"
      : "not_connected",
    connected: false,
    connection: latest
      ? {
          id: String(latest.id),
          displayName: latest.display_name,
          displayNumber: latest.address,
          connectionMode: latest.connection_mode,
          verifiedAt: latest.verified_at,
        }
      : null,
  };
}

export async function disconnectBusinessWhatsApp(
  businessId,
  db = pool,
) {
  validateBusinessId(businessId);

  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const channels = await client.query(
      `
        SELECT id
        FROM business_communication_channels
        WHERE business_id = $1
          AND channel = 'whatsapp'
          AND provider = 'meta_whatsapp'
        FOR UPDATE
      `,
      [String(businessId)],
    );

    const channelIds = channels.rows.map((row) => String(row.id));

    if (channelIds.length === 0) {
      await client.query("COMMIT");
      return { disconnected: false };
    }

    await client.query(
      `
        UPDATE business_communication_channels
        SET
          connection_status = 'disconnected',
          is_active = FALSE,
          updated_at = NOW()
        WHERE business_id = $1
          AND id = ANY($2::bigint[])
      `,
      [String(businessId), channelIds],
    );

    await client.query(
      `
        DELETE FROM business_communication_channel_credentials
        WHERE business_id = $1
          AND channel_connection_id = ANY($2::bigint[])
      `,
      [String(businessId), channelIds],
    );

    await client.query("COMMIT");

    return {
      disconnected: true,
      connectionsUpdated: channelIds.length,
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
