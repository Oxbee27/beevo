CREATE TABLE IF NOT EXISTS meta_whatsapp_account_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    event_field VARCHAR(80) NOT NULL,
    external_account_id VARCHAR(255),
    external_channel_id VARCHAR(255),
    event_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    processing_result VARCHAR(20) NOT NULL DEFAULT 'received'
        CHECK (processing_result IN ('received', 'matched', 'unmatched', 'ignored')),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meta_whatsapp_account_events_account
    ON meta_whatsapp_account_webhook_events (external_account_id);
CREATE INDEX IF NOT EXISTS idx_meta_whatsapp_account_events_channel
    ON meta_whatsapp_account_webhook_events (external_channel_id);
