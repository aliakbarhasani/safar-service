-- ============================================================================
-- SAFAR SERVICE - WALLET CURRENCY / TRANSACTION SCHEMA ALIGNMENT
-- Migration 031
-- ============================================================================
-- The wallet service records user_id and currency_id on each transaction.
-- Older schema versions did not define both columns consistently. Add them
-- idempotently and backfill existing rows from the referenced wallet.
--
-- currency_id is mandatory for a monetary transaction. user_id remains
-- nullable because platform/system wallets do not belong to a human user.

ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES currencies(id);

UPDATE transactions t
SET user_id = COALESCE(t.user_id, w.user_id),
    currency_id = COALESCE(t.currency_id, w.currency_id)
FROM wallets w
WHERE w.id = t.wallet_id
  AND (t.user_id IS NULL OR t.currency_id IS NULL);

-- Every transaction has a wallet_id FK, so its currency can be recovered
-- from that wallet. Fail migration rather than permit currency-less entries.
ALTER TABLE transactions
    ALTER COLUMN currency_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_currency ON transactions(currency_id);
