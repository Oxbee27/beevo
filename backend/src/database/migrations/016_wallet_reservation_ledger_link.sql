-- Link each captured communication reservation to exactly one ledger debit.

ALTER TABLE wallet_transactions
  ADD COLUMN IF NOT EXISTS reservation_id BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'wallet_transactions_reservation_id_fk'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transactions_reservation_id_fk
      FOREIGN KEY (reservation_id)
      REFERENCES wallet_reservations(id)
      ON DELETE RESTRICT;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reservation_unique
  ON wallet_transactions(reservation_id)
  WHERE reservation_id IS NOT NULL;
