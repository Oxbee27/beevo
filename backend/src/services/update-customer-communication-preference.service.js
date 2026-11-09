import pool from "../config/database.js";

export async function updateCustomerCommunicationPreference(
  businessId,
  customerId,
  data
) {
  const result = await pool.query(
    `
    INSERT INTO customer_communication_preferences (
      business_id,
      customer_id,
      channel,
      consent_status,
      consent_at,
      consent_source
    )
    SELECT
      $1,
      $2,
      $3,
      $4::VARCHAR,
      CASE
        WHEN $4::VARCHAR = 'granted' THEN NOW()
        ELSE NULL
      END,
      $5
    WHERE EXISTS (
      SELECT 1
      FROM customers
      WHERE business_id = $1
        AND id = $2
    )
    ON CONFLICT (business_id, customer_id, channel)
    DO UPDATE SET
      consent_status = EXCLUDED.consent_status,
      consent_at = EXCLUDED.consent_at,
      consent_source = EXCLUDED.consent_source,
      updated_at = NOW()
    RETURNING
      id,
      business_id,
      customer_id,
      channel,
      consent_status,
      consent_at,
      consent_source,
      created_at,
      updated_at
    `,
    [
      businessId,
      customerId,
      data.channel,
      data.consentStatus,
      data.consentSource || null,
    ]
  );

  return result.rows[0] || null;
}
