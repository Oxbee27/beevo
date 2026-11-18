-- Beevo communication billing: configurable rates and prepaid reservations.
-- All monetary values are integer NGN kobo.
-- Rates are deliberately unconfigured until explicitly supplied.

CREATE TABLE IF NOT EXISTS communication_channel_rates (
  channel VARCHAR(20) PRIMARY KEY
    CHECK (channel IN ('email', 'sms', 'whatsapp')),

  unit_name VARCHAR(20) NOT NULL
    CHECK (unit_name IN ('message', 'segment')),

  rate_kobo BIGINT
    CHECK (rate_kobo IS NULL OR rate_kobo > 0),

  enabled BOOLEAN NOT NULL DEFAULT FALSE,

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT communication_channel_rates_enabled_check
    CHECK (enabled = FALSE OR rate_kobo IS NOT NULL)
);

INSERT INTO communication_channel_rates (channel, unit_name)
VALUES
  ('email', 'message'),
  ('sms', 'segment'),
  ('whatsapp', 'message')
ON CONFLICT (channel) DO NOTHING;


CREATE TABLE IF NOT EXISTS wallet_reservations (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  business_id BIGINT NOT NULL
    REFERENCES businesses(id) ON DELETE RESTRICT,

  wallet_id BIGINT NOT NULL,

  message_id BIGINT NOT NULL,

  attempt_number INTEGER NOT NULL
    CHECK (attempt_number > 0),

  channel VARCHAR(20) NOT NULL
    CHECK (channel IN ('email', 'sms', 'whatsapp')),

  unit_count INTEGER NOT NULL
    CHECK (unit_count > 0),

  unit_rate_kobo BIGINT NOT NULL
    CHECK (unit_rate_kobo > 0),

  amount_kobo BIGINT NOT NULL
    CHECK (amount_kobo > 0),

  status VARCHAR(20) NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'captured', 'released')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  captured_at TIMESTAMPTZ,

  released_at TIMESTAMPTZ,

  CONSTRAINT wallet_reservations_wallet_business_fk
    FOREIGN KEY (wallet_id, business_id)
    REFERENCES business_wallets(id, business_id)
    ON DELETE RESTRICT,

  CONSTRAINT wallet_reservations_message_attempt_unique
    UNIQUE (business_id, message_id, attempt_number),

  CONSTRAINT wallet_reservations_state_timestamps_check
    CHECK (
      (status = 'reserved' AND captured_at IS NULL AND released_at IS NULL)
      OR
      (status = 'captured' AND captured_at IS NOT NULL AND released_at IS NULL)
      OR
      (status = 'released' AND captured_at IS NULL AND released_at IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS wallet_reservations_active_wallet_idx
  ON wallet_reservations (wallet_id, business_id)
  WHERE status = 'reserved';

CREATE INDEX IF NOT EXISTS wallet_reservations_message_idx
  ON wallet_reservations (business_id, message_id, attempt_number);
