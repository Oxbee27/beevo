-- Allow conversation replies to use the existing prepaid delivery queue.
-- Existing follow-up and restock integrity rules remain enforced.

ALTER TABLE conversation_messages
    ADD CONSTRAINT conversation_messages_business_conversation_id_unique
    UNIQUE (business_id, conversation_id, id);

ALTER TABLE follow_up_messages
    ADD COLUMN conversation_id BIGINT,
    ADD COLUMN conversation_message_id BIGINT;

ALTER TABLE follow_up_messages
    DROP CONSTRAINT follow_up_messages_source_type_check,
    DROP CONSTRAINT follow_up_messages_source_integrity_check;

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_source_type_check
    CHECK (source_type IN ('follow_up', 'restock', 'conversation'));

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_source_integrity_check
    CHECK (
        (
            source_type = 'follow_up'
            AND follow_up_id IS NOT NULL
            AND enquiry_id IS NOT NULL
            AND restock_recipient_id IS NULL
            AND conversation_id IS NULL
            AND conversation_message_id IS NULL
        )
        OR
        (
            source_type = 'restock'
            AND follow_up_id IS NULL
            AND enquiry_id IS NULL
            AND restock_recipient_id IS NOT NULL
            AND conversation_id IS NULL
            AND conversation_message_id IS NULL
        )
        OR
        (
            source_type = 'conversation'
            AND follow_up_id IS NULL
            AND enquiry_id IS NULL
            AND restock_recipient_id IS NULL
            AND conversation_id IS NOT NULL
            AND conversation_message_id IS NOT NULL
        )
    );

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_conversation_fk
    FOREIGN KEY (business_id, conversation_id)
    REFERENCES business_conversations (business_id, id)
    ON DELETE CASCADE;

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_conversation_message_fk
    FOREIGN KEY (business_id, conversation_id, conversation_message_id)
    REFERENCES conversation_messages (business_id, conversation_id, id)
    ON DELETE CASCADE;

CREATE INDEX follow_up_messages_conversation_idx
    ON follow_up_messages (business_id, conversation_id, id)
    WHERE conversation_id IS NOT NULL;

CREATE INDEX follow_up_messages_conversation_message_idx
    ON follow_up_messages (business_id, conversation_message_id)
    WHERE conversation_message_id IS NOT NULL;
