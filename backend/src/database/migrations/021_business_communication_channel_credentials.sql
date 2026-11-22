-- Store provider access tokens separately from public channel configuration.
-- Tokens must be encrypted by the application before insertion.

CREATE TABLE IF NOT EXISTS business_communication_channel_credentials (
    business_id BIGINT NOT NULL,
    channel_connection_id BIGINT NOT NULL,

    access_token_ciphertext TEXT NOT NULL
        CHECK (length(access_token_ciphertext) > 0),

    access_token_iv VARCHAR(24) NOT NULL
        CHECK (length(access_token_iv) = 16),

    access_token_auth_tag VARCHAR(24) NOT NULL
        CHECK (length(access_token_auth_tag) = 24),

    encryption_key_version SMALLINT NOT NULL DEFAULT 1
        CHECK (encryption_key_version > 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (business_id, channel_connection_id),

    FOREIGN KEY (business_id, channel_connection_id)
        REFERENCES business_communication_channels(business_id, id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_channel_credentials_business
    ON business_communication_channel_credentials (business_id);


-- Only Meta WhatsApp connections may have WhatsApp credentials stored.
CREATE OR REPLACE FUNCTION enforce_whatsapp_channel_credentials()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    connection_channel VARCHAR(20);
    connection_provider VARCHAR(40);
BEGIN
    SELECT channel, provider
    INTO connection_channel, connection_provider
    FROM business_communication_channels
    WHERE business_id = NEW.business_id
      AND id = NEW.channel_connection_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Communication channel connection does not exist.';
    END IF;

    IF connection_channel <> 'whatsapp'
       OR connection_provider <> 'meta_whatsapp' THEN
        RAISE EXCEPTION 'Credentials can only be stored for Meta WhatsApp connections.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_whatsapp_channel_credentials
    ON business_communication_channel_credentials;

CREATE TRIGGER trg_enforce_whatsapp_channel_credentials
    BEFORE INSERT OR UPDATE OF business_id, channel_connection_id
    ON business_communication_channel_credentials
    FOR EACH ROW
    EXECUTE FUNCTION enforce_whatsapp_channel_credentials();
