-- Keep billing preflight failures separate from provider delivery failures.
-- A billing-blocked message has not been submitted to an external provider.

ALTER TABLE follow_up_messages
  DROP CONSTRAINT IF EXISTS follow_up_messages_status_check;

ALTER TABLE follow_up_messages
  ADD CONSTRAINT follow_up_messages_status_check
  CHECK (
    status IN (
      'pending',
      'processing',
      'sent',
      'delivered',
      'failed',
      'cancelled',
      'unknown',
      'billing_blocked'
    )
  );

CREATE INDEX IF NOT EXISTS follow_up_messages_billing_blocked_idx
  ON follow_up_messages (business_id, updated_at)
  WHERE status = 'billing_blocked';


-- Make reservation references tenant-safe.
ALTER TABLE wallet_reservations
  ADD CONSTRAINT wallet_reservations_id_business_unique
  UNIQUE (id, business_id);

ALTER TABLE wallet_reservations
  ADD CONSTRAINT wallet_reservations_message_business_fk
  FOREIGN KEY (business_id, message_id)
  REFERENCES follow_up_messages (business_id, id)
  ON DELETE RESTRICT;


-- Replace the single-column reservation reference with a composite
-- reference that also verifies the owning business.
ALTER TABLE wallet_transactions
  DROP CONSTRAINT IF EXISTS wallet_transactions_reservation_id_fk;

ALTER TABLE wallet_transactions
  ADD CONSTRAINT wallet_transactions_reservation_business_fk
  FOREIGN KEY (reservation_id, business_id)
  REFERENCES wallet_reservations (id, business_id)
  ON DELETE RESTRICT;
