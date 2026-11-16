import pool from "../config/database.js";

export async function getResendDiagnostic(req, res, next) {
  try {
    const messageId = req.query.messageId || "1";

    if (!/^\d+$/.test(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID.",
      });
    }

    const migrations = await pool.query(`
      SELECT migration_name, applied_at
      FROM schema_migrations
      WHERE migration_name IN (
        '005_unknown_delivery_outcome.sql',
        '006_resend_webhook_events.sql'
      )
      ORDER BY migration_name
    `);

    const migrationNames = new Set(
      migrations.rows.map((row) => row.migration_name)
    );

    const hasWebhookMigration = migrationNames.has(
      "006_resend_webhook_events.sql"
    );

    const messageColumns = hasWebhookMigration
      ? `
          id,
          business_id,
          provider,
          provider_message_id,
          status,
          provider_event_at,
          sent_at,
          delivered_at,
          last_error
        `
      : `
          id,
          business_id,
          provider,
          provider_message_id,
          status,
          sent_at,
          delivered_at,
          last_error
        `;

    const messageResult = await pool.query(
      `
        SELECT ${messageColumns}
        FROM follow_up_messages
        WHERE id = $1
          AND business_id = $2
      `,
      [messageId, req.user.businessId]
    );

    if (messageResult.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Message not found for this business.",
      });
    }

    const message = messageResult.rows[0];

    const attempts = await pool.query(
      `
        SELECT
          id,
          attempt_number,
          status,
          provider,
          provider_message_id,
          error_message,
          attempted_at
        FROM message_delivery_attempts
        WHERE message_id = $1
          AND business_id = $2
        ORDER BY attempt_number DESC
      `,
      [messageId, req.user.businessId]
    );

    let webhookEvents = [];

    if (hasWebhookMigration && message.provider_message_id) {
      const result = await pool.query(
        `
          SELECT
            provider_event_id,
            event_type,
            processing_result,
            event_created_at,
            received_at,
            processed_at
          FROM resend_webhook_events
          WHERE provider_message_id = $1
          ORDER BY received_at DESC
          LIMIT 10
        `,
        [message.provider_message_id]
      );

      webhookEvents = result.rows;
    }

    return res.status(200).json({
      success: true,
      data: {
        migrations: migrations.rows,
        message,
        attempts: attempts.rows,
        webhookEvents,
      },
    });
  } catch (error) {
    return next(error);
  }
}
