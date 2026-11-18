-- Enforce successful funding timestamps and wallet-to-ledger consistency.

-- A successful funding attempt must have both timestamps.
-- A non-successful attempt must never have a credited_at timestamp.
ALTER TABLE wallet_payment_attempts
ADD CONSTRAINT wallet_payment_attempt_credit_timestamps_check
CHECK (
    (
        status <> 'successful'
        OR (verified_at IS NOT NULL AND credited_at IS NOT NULL)
    )
    AND (
        credited_at IS NULL
        OR status = 'successful'
    )
);

-- Validate wallet balances against the immutable transaction ledger.
-- These are deferred constraint triggers so the wallet update and ledger
-- insertion can happen in either order inside one database transaction.
CREATE OR REPLACE FUNCTION enforce_wallet_ledger_balance()
RETURNS TRIGGER AS $$
DECLARE
    target_wallet_id BIGINT;
    target_business_id BIGINT;
    wallet_balance NUMERIC;
    ledger_balance NUMERIC;
BEGIN
    IF TG_TABLE_NAME = 'business_wallets' THEN
        target_wallet_id := NEW.id;
        target_business_id := NEW.business_id;
    ELSE
        target_wallet_id := NEW.wallet_id;
        target_business_id := NEW.business_id;
    END IF;

    SELECT balance_kobo::NUMERIC
    INTO wallet_balance
    FROM business_wallets
    WHERE id = target_wallet_id
      AND business_id = target_business_id;

    -- The wallet may no longer exist during a cascading business deletion.
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        SUM(
            CASE
                WHEN transaction_type = 'credit'
                    THEN amount_kobo::NUMERIC
                WHEN transaction_type = 'debit'
                    THEN -amount_kobo::NUMERIC
            END
        ),
        0
    )
    INTO ledger_balance
    FROM wallet_transactions
    WHERE wallet_id = target_wallet_id
      AND business_id = target_business_id;

    IF wallet_balance IS DISTINCT FROM ledger_balance THEN
        RAISE EXCEPTION
            'Wallet balance does not match its transaction ledger for wallet %.',
            target_wallet_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER wallet_balance_matches_ledger
AFTER INSERT OR UPDATE ON business_wallets
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_wallet_ledger_balance();

CREATE CONSTRAINT TRIGGER wallet_ledger_matches_balance
AFTER INSERT ON wallet_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_wallet_ledger_balance();
