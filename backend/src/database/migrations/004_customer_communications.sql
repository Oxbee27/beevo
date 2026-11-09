-- Beevo customer communication foundation.
-- Supports email, SMS and WhatsApp.
-- All related records are constrained to the same business.

-- Composite unique constraints allow PostgreSQL to enforce
-- business ownership across related records.

ALTER TABLE customers
    ADD CONSTRAINT customers_business_id_id_unique
    UNIQUE (business_id, id);

ALTER TABLE enquiries
    ADD CONSTRAINT enquiries_business_enquiry_customer_unique
    UNIQUE (business_id, id, customer_id);

ALTER TABLE follow_ups
    ADD CONSTRAINT follow_ups_business_id_id_enquiry_unique
    UNIQUE (business_id, id, enquiry_id);


-- 1. Customer communication consent and preferences.

CREATE TABLE customer_communication_preferences (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('email', 'sms', 'whatsapp')),

    consent_status VARCHAR(20) NOT NULL DEFAULT 'unknown'
        CHECK (consent_status IN ('unknown', 'granted', 'denied')),

    consent_at TIMESTAMPTZ,
    consent_source VARCHAR(100),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT customer_communication_preferences_unique
        UNIQUE (business_id, customer_id, channel),

    CONSTRAINT customer_communication_preferences_customer_fk
        FOREIGN KEY (business_id, customer_id)
        REFERENCES customers (business_id, id)
        ON DELETE CASCADE,

    CONSTRAINT customer_communication_consent_timestamp_check
        CHECK (
            consent_status <> 'granted'
            OR consent_at IS NOT NULL
        )
);


-- 2. Scheduled customer messages and delivery queue.

CREATE TABLE follow_up_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL,
    follow_up_id BIGINT NOT NULL,
    enquiry_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,

    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('email', 'sms', 'whatsapp')),

    recipient VARCHAR(320) NOT NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,

    template_key VARCHAR(100),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'processing',
                'sent',
                'delivered',
                'failed',
                'cancelled'
            )
        ),

    scheduled_for TIMESTAMPTZ NOT NULL,
    next_attempt_at TIMESTAMPTZ NOT NULL,

    attempt_count INTEGER NOT NULL DEFAULT 0
        CHECK (attempt_count >= 0),

    max_attempts INTEGER NOT NULL DEFAULT 5
        CHECK (max_attempts > 0),

    idempotency_key VARCHAR(150),

    provider VARCHAR(50),
    provider_message_id VARCHAR(255),

    last_error TEXT,

    locked_at TIMESTAMPTZ,
    locked_by VARCHAR(100),

    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT follow_up_messages_business_id_id_unique
        UNIQUE (business_id, id),
    CONSTRAINT follow_up_messages_business_idempotency_unique
        UNIQUE (business_id, idempotency_key),

    CONSTRAINT follow_up_messages_follow_up_fk
        FOREIGN KEY (business_id, follow_up_id, enquiry_id)
        REFERENCES follow_ups (business_id, id, enquiry_id)
        ON DELETE CASCADE,

    CONSTRAINT follow_up_messages_customer_fk
        FOREIGN KEY (business_id, enquiry_id, customer_id)
        REFERENCES enquiries (business_id, id, customer_id)
        ON DELETE CASCADE,

    CONSTRAINT follow_up_messages_attempt_limit_check
        CHECK (attempt_count <= max_attempts),

    CONSTRAINT follow_up_messages_delivery_timestamp_check
        CHECK (
            delivered_at IS NULL
            OR sent_at IS NOT NULL
        )
);


-- 3. Individual delivery attempts for auditing and troubleshooting.

CREATE TABLE message_delivery_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL,
    message_id BIGINT NOT NULL,

    attempt_number INTEGER NOT NULL
        CHECK (attempt_number > 0),

    provider VARCHAR(50) NOT NULL,

    status VARCHAR(20) NOT NULL
        CHECK (status IN ('processing', 'sent', 'failed')),

    provider_message_id VARCHAR(255),
    error_message TEXT,

    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT message_delivery_attempts_unique
        UNIQUE (business_id, message_id, attempt_number),

    CONSTRAINT message_delivery_attempts_message_fk
        FOREIGN KEY (business_id, message_id)
        REFERENCES follow_up_messages (business_id, id)
        ON DELETE CASCADE
);


-- Queue indexes for scheduled delivery and worker recovery.

CREATE INDEX idx_follow_up_messages_pending_queue
    ON follow_up_messages (next_attempt_at, scheduled_for)
    WHERE status = 'pending';

CREATE INDEX idx_follow_up_messages_processing
    ON follow_up_messages (locked_at)
    WHERE status = 'processing';

CREATE INDEX idx_follow_up_messages_business_customer
    ON follow_up_messages (business_id, customer_id);

CREATE INDEX idx_message_delivery_attempts_message
    ON message_delivery_attempts (business_id, message_id);

CREATE INDEX idx_customer_communication_preferences_customer
    ON customer_communication_preferences (business_id, customer_id);
