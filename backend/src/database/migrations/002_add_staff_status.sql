-- Add account activation status.
-- Existing users remain active by default.

ALTER TABLE users
ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Make staff lookups efficient.
CREATE INDEX idx_users_business_staff_status
ON users (business_id, is_active)
WHERE role = 'staff';
