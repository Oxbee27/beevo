CREATE TABLE business_communication_profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL UNIQUE
        REFERENCES businesses(id) ON DELETE CASCADE,

    email_sender_name VARCHAR(150),
    email_sender_address VARCHAR(255),
    email_reply_to VARCHAR(255),
    email_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
        CHECK (email_status IN ('not_configured', 'pending', 'verified', 'rejected')),

    sms_sender_id VARCHAR(11),
    sms_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
        CHECK (sms_status IN ('not_configured', 'pending', 'approved', 'rejected')),

    whatsapp_business_account_id VARCHAR(100),
    whatsapp_phone_number_id VARCHAR(100),
    whatsapp_display_number VARCHAR(30),
    whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'not_configured'
        CHECK (whatsapp_status IN ('not_configured', 'pending', 'verified', 'rejected')),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_business_communication_profiles_business
    ON business_communication_profiles (business_id);
