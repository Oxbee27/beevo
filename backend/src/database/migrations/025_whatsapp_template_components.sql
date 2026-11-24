-- Store approved WhatsApp template parameters with queued messages.
ALTER TABLE follow_up_messages
    ADD COLUMN template_components JSONB NOT NULL DEFAULT '[]'::JSONB;

ALTER TABLE follow_up_messages
    ADD CONSTRAINT follow_up_messages_template_components_array_check
    CHECK (jsonb_typeof(template_components) = 'array');
