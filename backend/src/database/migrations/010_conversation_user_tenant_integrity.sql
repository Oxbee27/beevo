-- Enforce that conversation user references belong to the same business.
-- Preserve nullable user references when a user is deleted.

-- A primary key on id does not provide the composite key required by
-- the tenant-safe foreign keys below.
ALTER TABLE users
    ADD CONSTRAINT users_business_id_id_unique
    UNIQUE (business_id, id);

-- Clean up any legacy cross-business references before adding constraints.
UPDATE business_conversations c
SET assigned_to = NULL
WHERE c.assigned_to IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = c.assigned_to
        AND u.business_id = c.business_id
  );

UPDATE business_conversations c
SET classified_by = NULL
WHERE c.classified_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = c.classified_by
        AND u.business_id = c.business_id
  );

UPDATE conversation_messages m
SET created_by = NULL
WHERE m.created_by IS NOT NULL
  AND NOT EXISTS (
      SELECT 1
      FROM users u
      WHERE u.id = m.created_by
        AND u.business_id = m.business_id
  );

-- Replace the original single-column foreign keys.
ALTER TABLE business_conversations
    DROP CONSTRAINT IF EXISTS business_conversations_assigned_to_fkey;

ALTER TABLE business_conversations
    DROP CONSTRAINT IF EXISTS business_conversations_classified_by_fkey;

ALTER TABLE conversation_messages
    DROP CONSTRAINT IF EXISTS conversation_messages_created_by_fkey;

-- Composite foreign keys enforce business ownership.
-- Default NO ACTION is intentional: the trigger below nulls references
-- before a user is deleted, without nulling the business_id column.
ALTER TABLE business_conversations
    ADD CONSTRAINT business_conversations_assigned_user_tenant_fkey
    FOREIGN KEY (business_id, assigned_to)
    REFERENCES users (business_id, id);

ALTER TABLE business_conversations
    ADD CONSTRAINT business_conversations_classifier_user_tenant_fkey
    FOREIGN KEY (business_id, classified_by)
    REFERENCES users (business_id, id);

ALTER TABLE conversation_messages
    ADD CONSTRAINT conversation_messages_creator_user_tenant_fkey
    FOREIGN KEY (business_id, created_by)
    REFERENCES users (business_id, id);

-- Preserve the previous ON DELETE SET NULL behavior for these references.
CREATE OR REPLACE FUNCTION clear_conversation_user_references_before_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE business_conversations
    SET assigned_to = NULL
    WHERE business_id = OLD.business_id
      AND assigned_to = OLD.id;

    UPDATE business_conversations
    SET classified_by = NULL
    WHERE business_id = OLD.business_id
      AND classified_by = OLD.id;

    UPDATE conversation_messages
    SET created_by = NULL
    WHERE business_id = OLD.business_id
      AND created_by = OLD.id;

    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_conversation_user_references
    ON users;

CREATE TRIGGER trg_clear_conversation_user_references
BEFORE DELETE ON users
FOR EACH ROW
EXECUTE FUNCTION clear_conversation_user_references_before_delete();
