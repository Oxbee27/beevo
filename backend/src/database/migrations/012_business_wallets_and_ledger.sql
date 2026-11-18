-- Beevo business wallets, Paystack funding attempts and immutable ledger.

-- 1. One wallet per business.
CREATE TABLE business_wallets (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL UNIQUE
        REFERENCES businesses(id) ON DELETE CASCADE,

    currency CHAR(3) NOT NULL DEFAULT 'NGN'
        CHECK (currency = 'NGN'),

    balance_kobo BIGINT NOT NULL DEFAULT 0
        CHECK (balance_kobo >= 0),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_wallet_business_pair
        UNIQUE (id, business_id)
);

-- 2. Create wallets for businesses that already exist.
INSERT INTO business_wallets (business_id)
SELECT id
FROM businesses
ON CONFLICT (business_id) DO NOTHING;

-- 3. Automatically create a wallet for every new business.
CREATE OR REPLACE FUNCTION create_business_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO business_wallets (business_id)
    VALUES (NEW.id)
    ON CONFLICT (business_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER businesses_create_wallet
AFTER INSERT ON businesses
FOR EACH ROW
EXECUTE FUNCTION create_business_wallet();

-- 4. Track payment initialization and verification.
CREATE TABLE wallet_payment_attempts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    business_id BIGINT NOT NULL
        REFERENCES businesses(id) ON DELETE CASCADE,

    reference VARCHAR(150) NOT NULL UNIQUE,

    idempotency_key VARCHAR(150),

    provider VARCHAR(30) NOT NULL DEFAULT 'paystack'
        CHECK (provider = 'paystack'),

    amount_kobo BIGINT NOT NULL
        CHECK (amount_kobo > 0),

    currency CHAR(3) NOT NULL DEFAULT 'NGN'
        CHECK (currency = 'NGN'),

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'successful',
                'failed',
                'abandoned'
            )
        ),

    provider_reference VARCHAR(150) UNIQUE,

    channel VARCHAR(50),

    gateway_response JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(gateway_response) = 'object'),

    verified_at TIMESTAMPTZ,
    credited_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_payment_attempt_business_pair
        UNIQUE (id, business_id),

    CONSTRAINT unique_business_payment_idempotency
        UNIQUE (business_id, idempotency_key)
);

-- 5. Immutable financial transaction ledger.
CREATE TABLE wallet_transactions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    wallet_id BIGINT NOT NULL,
    business_id BIGINT NOT NULL,

    payment_attempt_id BIGINT UNIQUE,

    transaction_type VARCHAR(10) NOT NULL
        CHECK (transaction_type IN ('credit', 'debit')),

    amount_kobo BIGINT NOT NULL
        CHECK (amount_kobo > 0),

    balance_after_kobo BIGINT NOT NULL
        CHECK (balance_after_kobo >= 0),

    reference VARCHAR(150) NOT NULL UNIQUE,

    description TEXT NOT NULL,

    metadata JSONB NOT NULL DEFAULT '{}'::JSONB
        CHECK (jsonb_typeof(metadata) = 'object'),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT wallet_transactions_wallet_business_fk
        FOREIGN KEY (wallet_id, business_id)
        REFERENCES business_wallets(id, business_id)
        ON DELETE RESTRICT,

    CONSTRAINT wallet_transactions_payment_business_fk
        FOREIGN KEY (payment_attempt_id, business_id)
        REFERENCES wallet_payment_attempts(id, business_id)
        ON DELETE RESTRICT
);

-- 6. Indexes for wallet and financial history queries.
CREATE INDEX idx_wallet_transactions_business_created
ON wallet_transactions (business_id, created_at DESC);

CREATE INDEX idx_wallet_transactions_wallet_created
ON wallet_transactions (wallet_id, created_at DESC);

CREATE INDEX idx_wallet_payment_attempts_business_created
ON wallet_payment_attempts (business_id, created_at DESC);

CREATE INDEX idx_wallet_payment_attempts_pending
ON wallet_payment_attempts (created_at)
WHERE status = 'pending';

-- 7. Prevent modification or deletion of financial ledger entries.
CREATE OR REPLACE FUNCTION prevent_wallet_transaction_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION
        'Wallet ledger entries cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_transactions_immutable
BEFORE UPDATE OR DELETE ON wallet_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_wallet_transaction_mutation();
