-- Preserve fractional monetary values returned by the wallet reconciliation snapshot.
-- Migration 005 changes wallet and ledger monetary columns from BIGINT to NUMERIC(20,8).
-- The original snapshot function still declared BIGINT outputs, which can reject
-- the query or lose fractional precision. Replace it with NUMERIC outputs.
DROP FUNCTION IF EXISTS fn_get_wallet_snapshot(UUID);

CREATE FUNCTION fn_get_wallet_snapshot(p_wallet_id UUID)
RETURNS TABLE (
    wallet_id UUID,
    total_balance NUMERIC,
    available_balance NUMERIC,
    frozen_balance NUMERIC,
    ledger_total_credits NUMERIC,
    ledger_total_debits NUMERIC,
    ledger_balance NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
    SELECT
        w.id AS wallet_id,
        w.balance AS total_balance,
        w.available_balance,
        w.frozen_balance,
        COALESCE(SUM(wl.credit_amount), 0::NUMERIC) AS ledger_total_credits,
        COALESCE(SUM(wl.debit_amount), 0::NUMERIC) AS ledger_total_debits,
        COALESCE(SUM(wl.credit_amount), 0::NUMERIC)
          - COALESCE(SUM(wl.debit_amount), 0::NUMERIC) AS ledger_balance
    FROM wallets w
    LEFT JOIN wallet_ledger wl ON wl.wallet_id = w.id
    WHERE w.id = p_wallet_id
    GROUP BY w.id, w.balance, w.available_balance, w.frozen_balance;
$$;
