-- Add dedicated permissions for conversations and communications.
INSERT INTO permissions (code, description)
VALUES
    ('conversations.view', 'View business conversations'),
    ('conversations.edit', 'Classify and manage business conversations'),
    ('communications.view', 'View communication channels and messages'),
    ('communications.edit', 'Cancel and retry communication messages')
ON CONFLICT (code) DO NOTHING;

-- Preserve existing staff access by copying follow-up permissions
-- to the corresponding new feature permissions.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, new_permission.id
FROM role_permissions rp
JOIN permissions old_permission
    ON old_permission.id = rp.permission_id
JOIN permissions new_permission
    ON new_permission.code = CASE
        WHEN old_permission.code = 'follow_ups.view'
            THEN 'conversations.view'
        WHEN old_permission.code = 'follow_ups.edit'
            THEN 'conversations.edit'
    END
WHERE old_permission.code IN ('follow_ups.view', 'follow_ups.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, new_permission.id
FROM role_permissions rp
JOIN permissions old_permission
    ON old_permission.id = rp.permission_id
JOIN permissions new_permission
    ON new_permission.code = CASE
        WHEN old_permission.code = 'follow_ups.view'
            THEN 'communications.view'
        WHEN old_permission.code = 'follow_ups.edit'
            THEN 'communications.edit'
    END
WHERE old_permission.code IN ('follow_ups.view', 'follow_ups.edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;
