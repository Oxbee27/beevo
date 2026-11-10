-- Prevent automatic retries when a worker stops and delivery outcome
-- cannot be established. Manual reconciliation is required.

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
            'unknown'
        )
    );

ALTER TABLE message_delivery_attempts
    DROP CONSTRAINT IF EXISTS message_delivery_attempts_status_check;

ALTER TABLE message_delivery_attempts
    ADD CONSTRAINT message_delivery_attempts_status_check
    CHECK (
        status IN (
            'processing',
            'sent',
            'failed',
            'unknown'
        )
    );
