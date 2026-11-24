-- Migration 010 already provides the required unique
-- (business_id, id) constraint on users.

CREATE TABLE IF NOT EXISTS meta_embedded_signup_states (
    state_hash VARCHAR(64) PRIMARY KEY
        CHECK (state_hash ~ '^[a-f0-9]{64}$'),
    business_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT meta_embedded_signup_states_user_business_fkey
        FOREIGN KEY (business_id, user_id)
        REFERENCES users (business_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_meta_signup_states_business_user
ON meta_embedded_signup_states (business_id, user_id);

CREATE INDEX IF NOT EXISTS idx_meta_signup_states_expiry
ON meta_embedded_signup_states (expires_at);
