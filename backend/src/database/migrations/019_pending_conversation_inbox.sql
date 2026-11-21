-- Secure holding area for inbound messages awaiting owner classification.
-- No automatic expiry: owners decide whether messages are business-related.

CREATE TABLE pending_conversation_messages (
    id BIGSERIAL PRIMARY KEY,
    business_id BIGINT NOT NULL,
    conversation_id BIGINT NOT NULL,
    channel_connection_id BIGINT NOT NULL,
    provider_message_id VARCHAR(255) NOT NULL,

    message_type VARCHAR(30) NOT NULL DEFAULT 'other'
        CHECK (message_type IN (
            'text', 'template', 'image', 'document', 'audio',
            'video', 'location', 'interactive', 'other'
        )),

    body TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT pending_conversation_messages_conversation_fk
        FOREIGN KEY (business_id, conversation_id)
        REFERENCES business_conversations (business_id, id)
        ON DELETE CASCADE,

    CONSTRAINT pending_conversation_messages_channel_fk
        FOREIGN KEY (business_id, channel_connection_id)
        REFERENCES business_communication_channels (business_id, id)
        ON DELETE CASCADE,

    CONSTRAINT pending_conversation_messages_provider_unique
        UNIQUE (channel_connection_id, provider_message_id)
);

CREATE INDEX idx_pending_conversation_messages_inbox
    ON pending_conversation_messages (
        business_id, conversation_id, received_at DESC, id DESC
    );

-- Pending content may only be stored while a conversation is unclassified.
CREATE OR REPLACE FUNCTION enforce_pending_conversation_message()
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

    IF current_classification IS DISTINCT FROM 'unclassified' THEN
        RAISE EXCEPTION 'Pending messages require an unclassified conversation.';
    END IF;

    IF current_channel_connection_id <> NEW.channel_connection_id THEN
        RAISE EXCEPTION 'Message channel does not match its conversation.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_pending_conversation_message
    BEFORE INSERT OR UPDATE ON pending_conversation_messages
    FOR EACH ROW
    EXECUTE FUNCTION enforce_pending_conversation_message();
