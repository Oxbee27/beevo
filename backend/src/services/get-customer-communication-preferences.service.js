import pool from "../config/database.js";

export async function getCustomerCommunicationPreferences(
  businessId,
  customerId
) {
  const result = await pool.query(
    `
    SELECT
      channels.channel,
      COALESCE(preferences.consent_status, 'unknown') AS consent_status,
      preferences.consent_at,
      preferences.consent_source,
      preferences.created_at,
      preferences.updated_at
    FROM (
      VALUES
        ('email'),
        ('sms'),
        ('whatsapp')
    ) AS channels(channel)
    LEFT JOIN customer_communication_preferences preferences
      ON preferences.channel = channels.channel
      AND preferences.business_id = $1
      AND preferences.customer_id = $2
    WHERE EXISTS (
      SELECT 1
      FROM customers
      WHERE business_id = $1
        AND id = $2
    )
    ORDER BY
      CASE channels.channel
        WHEN 'email' THEN 1
        WHEN 'sms' THEN 2
        WHEN 'whatsapp' THEN 3
      END
    `,
    [businessId, customerId]
  );

  // No rows means the customer does not belong to this business.
  if (result.rowCount === 0) {
    return null;
  }

  return result.rows;
}
