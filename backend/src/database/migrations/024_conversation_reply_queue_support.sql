-- Conversation replies do not belong to a follow-up or enquiry.
-- These columns must be nullable for source_type = 'conversation'.

ALTER TABLE follow_up_messages
    ALTER COLUMN follow_up_id DROP NOT NULL,
    ALTER COLUMN enquiry_id DROP NOT NULL;
