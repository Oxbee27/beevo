-- Audit Meta WhatsApp delivery webhook events.
CREATE TABLE whatsapp_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    event_fingerprint VARCHAR(64) NOT NULL UNIQUE,
    provider_message_id VARCHAR(255),
    event_status VARCHAR(30),
    provider_event_at TIMESTAMPTZ,
    error_message TEXT,
    processing_result VARCHAR(30) NOT NULL DEFAULT 'received'
        CHECK (
            processing_result IN (
                'received',
                'matched',
                'unmatched',
                'already_final',
                'stale',
                'ignored',
                'duplicate'
            )
        ),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_whatsapp_webhook_events_message
    ON whatsapp_webhook_events (provider_message_id);
