-- Ensure every immutable ledger entry records its correct running balance.

-- Validate existing ledger entries before installing the new constraint.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM (
            SELECT
                balance_after_kobo,
                SUM(
                    CASE
                        WHEN transaction_type = 'credit'
                            THEN amount_kobo::NUMERIC
                        WHEN transaction_type = 'debit'
                            THEN -amount_kobo::NUMERIC
                    END
                ) OVER (
                    PARTITION BY wallet_id, business_id
                    ORDER BY id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS expected_balance
            FROM wallet_transactions
        ) ledger
        WHERE balance_after_kobo::NUMERIC
            IS DISTINCT FROM expected_balance
    ) THEN
        RAISE EXCEPTION
            'Existing wallet ledger contains an incorrect running balance.'
            USING ERRCODE = '23514';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION enforce_wallet_ledger_running_balance()
RETURNS TRIGGER AS $$
DECLARE
    invalid_entry_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM (
            SELECT
                balance_after_kobo,
                SUM(
                    CASE
                        WHEN transaction_type = 'credit'
                            THEN amount_kobo::NUMERIC
                        WHEN transaction_type = 'debit'
                            THEN -amount_kobo::NUMERIC
                    END
                ) OVER (
                    ORDER BY id
                    ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
                ) AS expected_balance
            FROM wallet_transactions
            WHERE wallet_id = NEW.wallet_id
              AND business_id = NEW.business_id
        ) ledger
        WHERE balance_after_kobo::NUMERIC
            IS DISTINCT FROM expected_balance
    )
    INTO invalid_entry_exists;

    IF invalid_entry_exists THEN
        RAISE EXCEPTION
            'Wallet transaction contains an incorrect running balance for wallet %.',
            NEW.wallet_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER wallet_transaction_running_balance_check
AFTER INSERT ON wallet_transactions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION enforce_wallet_ledger_running_balance();
