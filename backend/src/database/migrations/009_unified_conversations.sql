
-- Business communication channels.
-- Provider credentials and secrets must never be stored in this table.
CREATE TABLE IF NOT EXISTS business_communication_channels (
    id BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

    channel VARCHAR(20) NOT NULL
        CHECK (channel IN ('whatsapp', 'sms', 'email')),

    provider VARCHAR(40) NOT NULL,

    connection_mode VARCHAR(20) NOT NULL DEFAULT 'dedicated'
        CHECK (connection_mode IN ('dedicated', 'coexistence')),

    display_name VARCHAR(150),
    address VARCHAR(320) NOT NULL,
    external_account_id VARCHAR(255),
    external_channel_id VARCHAR(255),

    connection_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (
            connection_status IN (
                'pending',
                'connected',
                'disconnected',
                'failed'
            )
        ),

    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (business_id, channel, provider, address),
    UNIQUE (business_id, id)
);

CREATE INDEX IF NOT EXISTS idx_business_channels_active
    ON business_communication_channels (business_id, channel)
    WHERE is_active = TRUE;


-- Conversation records.
-- Unclassified conversations contain contact metadata only.
CREATE TABLE IF NOT EXISTS business_conversations (
    id BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    channel_connection_id BIGINT NOT NULL,

    customer_id BIGINT,

    contact_identifier VARCHAR(320) NOT NULL,
    contact_display_name VARCHAR(150),

    classification_status VARCHAR(20) NOT NULL DEFAULT 'unclassified'
        CHECK (
            classification_status IN (
                'unclassified',
                'business',
                'excluded'
            )
        ),

    conversation_status VARCHAR(20) NOT NULL DEFAULT 'open'
        CHECK (
            conversation_status IN (
                'open',
                'pending',
                'resolved'
            )
        ),

    assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,

    subject VARCHAR(255),
    last_message_at TIMESTAMPTZ,
    classified_at TIMESTAMPTZ,
    classified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (business_id, channel_connection_id)
        REFERENCES business_communication_channels(business_id, id)
        ON DELETE CASCADE,

    FOREIGN KEY (customer_id)
        REFERENCES customers(id)
        ON DELETE SET NULL,

    UNIQUE (business_id, id),
    UNIQUE (business_id, channel_connection_id, contact_identifier)
);


CREATE INDEX IF NOT EXISTS idx_business_conversations_inbox
    ON business_conversations (
        business_id,
        conversation_status,
        last_message_at DESC
    );

CREATE INDEX IF NOT EXISTS idx_business_conversations_customer
    ON business_conversations (business_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_business_conversations_assignee
    ON business_conversations (business_id, assigned_to);


-- Ensure a linked customer belongs to the same business.
CREATE OR REPLACE FUNCTION enforce_conversation_customer_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.customer_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM customers
        WHERE id = NEW.customer_id
          AND business_id = NEW.business_id
    ) THEN
        RAISE EXCEPTION 'Customer does not belong to this business.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_conversation_customer_tenant
    ON business_conversations;

CREATE TRIGGER trg_enforce_conversation_customer_tenant
    BEFORE INSERT OR UPDATE OF customer_id, business_id
    ON business_conversations
    FOR EACH ROW
    EXECUTE FUNCTION enforce_conversation_customer_tenant();


-- Conversation messages.
-- Content is only permitted for explicitly classified business conversations.
CREATE TABLE IF NOT EXISTS conversation_messages (
    id BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,

    channel_connection_id BIGINT NOT NULL,

    direction VARCHAR(10) NOT NULL
        CHECK (direction IN ('inbound', 'outbound')),

    provider_message_id VARCHAR(255),

    message_type VARCHAR(30) NOT NULL DEFAULT 'text'
        CHECK (
            message_type IN (
                'text',
                'template',
                'image',
                'document',
                'audio',
                'video',
                'location',
                'interactive',
                'other'
            )
        ),

    body TEXT,

    delivery_status VARCHAR(20) NOT NULL DEFAULT 'received'
        CHECK (
            delivery_status IN (
                'received',
                'queued',
                'sent',
                'delivered',
                'read',
                'failed',
                'unknown'
            )
        ),

    sent_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,

    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (business_id, conversation_id)
        REFERENCES business_conversations(business_id, id)
        ON DELETE CASCADE,

    FOREIGN KEY (business_id, channel_connection_id)
        REFERENCES business_communication_channels(business_id, id)
        ON DELETE CASCADE
);


CREATE INDEX IF NOT EXISTS idx_conversation_messages_timeline
    ON conversation_messages (business_id, conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_messages_provider
    ON conversation_messages (channel_connection_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL;


-- Prevent provider webhook duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_messages_provider_unique
    ON conversation_messages (channel_connection_id, provider_message_id)
    WHERE provider_message_id IS NOT NULL;


-- Database-level privacy protection:
-- A message cannot be stored unless its conversation is classified as business.
CREATE OR REPLACE FUNCTION enforce_business_conversation_message()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    current_classification VARCHAR(20);
    current_channel_connection_id BIGINT;
BEGIN
    SELECT classification_status, channel_connection_id
    INTO current_classification, current_channel_connection_id
    FROM business_conversations
    WHERE business_id = NEW.business_id
      AND id = NEW.conversation_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Conversation does not exist for this business.';
    END IF;

    IF current_classification <> 'business' THEN
        RAISE EXCEPTION 'Messages can only be stored for business-classified conversations.';
    END IF;

    IF current_channel_connection_id <> NEW.channel_connection_id THEN
        RAISE EXCEPTION 'Message channel does not match its conversation.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_business_conversation_message
    ON conversation_messages;

CREATE TRIGGER trg_enforce_business_conversation_message
    BEFORE INSERT OR UPDATE ON conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION enforce_business_conversation_message();



-- Purge stored messages whenever a conversation is no longer classified
-- as a business conversation.
CREATE OR REPLACE FUNCTION purge_non_business_conversation_messages()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.classification_status = 'business'
       AND NEW.classification_status <> 'business' THEN
        DELETE FROM conversation_messages
        WHERE business_id = NEW.business_id
          AND conversation_id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_non_business_conversation_messages
    ON business_conversations;

CREATE TRIGGER trg_purge_non_business_conversation_messages
    AFTER UPDATE OF classification_status
    ON business_conversations
    FOR EACH ROW
    EXECUTE FUNCTION purge_non_business_conversation_messages();
