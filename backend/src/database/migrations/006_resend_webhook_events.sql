-- Record Resend webhook events and the provider event time used for ordering.

ALTER TABLE follow_up_messages
    ADD COLUMN provider_event_at TIMESTAMPTZ;

CREATE TABLE resend_webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_event_id VARCHAR(255) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    provider_message_id VARCHAR(255),
    event_created_at TIMESTAMPTZ,
    processing_result VARCHAR(30) NOT NULL DEFAULT 'received'
        CHECK (
            processing_result IN (
                'received',
                'matched',
                'unmatched',
                'already_final',
                'ignored',
                'duplicate',
                'stale'
            )
        ),
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_resend_webhook_events_message
    ON resend_webhook_events (provider_message_id);
