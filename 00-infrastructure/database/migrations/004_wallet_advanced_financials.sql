-- ============================================================================
-- SAFAR SERVICE - WALLET ADVANCED FINANCIALS
-- PostgreSQL Migration 004
-- ============================================================================
-- This migration upgrades the wallet system with:
--   • Available/Frozen balance separation for escrow support
--   • wallet_ledger: Append-only ledger for complete financial traceability
--   • financial_audit_logs: Security audit trail for financial operations
--   • wallet_type ENUM for wallet classification
--   • Advanced financial operations (freeze, escrow, refund)
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- (P1 — Idempotent) ساخت enum داخل بلوک محافظت‌شده تا اجرای چندباره خطا ندهد
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'wallet_type') THEN
        CREATE TYPE wallet_type AS ENUM (
            'user',      -- Regular user wallet (passengers)
            'driver',    -- Driver wallet
            'platform',  -- Platform/company wallet
            'escrow',    -- Escrow/holding wallet for trip payments
            'system'     -- System wallet (no user_id required)
        );
    END IF;
END $$;

-- ============================================================================
-- ALTER TABLE: wallets - Add balance separation
-- ============================================================================

-- Add available_balance and frozen_balance columns
-- These replace the monolithic balance with a split balance model
-- Total balance = available_balance + frozen_balance
ALTER TABLE wallets
    ADD COLUMN IF NOT EXISTS wallet_type wallet_type NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS available_balance BIGINT NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
    ADD COLUMN IF NOT EXISTS frozen_balance BIGINT NOT NULL DEFAULT 0 CHECK (frozen_balance >= 0);

-- Initialize available_balance from existing balance for backward compatibility
UPDATE wallets
SET available_balance = balance
WHERE available_balance = 0 AND balance > 0;
-- (P1 — Idempotent) حذف محافظت‌شده پیش از بازسازی constraint
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallet_balance_total;


-- Add constraint: total balance must always match available + frozen
ALTER TABLE wallets
    ADD CONSTRAINT ck_wallet_balance_total
    CHECK (balance = available_balance + frozen_balance);

-- Index for wallet type queries
CREATE INDEX IF NOT EXISTS idx_wallets_type ON wallets(wallet_type);

-- Update users table reference for wallet_type
-- Drop existing constraint on balance (to be replaced by the new one)
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_balance_check;
-- (P1 — Idempotent) حذف محافظت‌شده پیش از بازسازی constraint
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_balance_check;

ALTER TABLE wallets ADD CONSTRAINT wallets_balance_check CHECK (balance >= 0);

-- ============================================================================
-- FIX: Allow system/platform/escrow wallets to have NULL user_id
-- ============================================================================
-- System wallets (platform, escrow, system) don't belong to a specific user.
-- This change makes user_id optional for non-human wallet types.
ALTER TABLE wallets ALTER COLUMN user_id DROP NOT NULL;
-- (P1 — Idempotent) حذف محافظت‌شده پیش از بازسازی constraint
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_user_id_for_humans;

ALTER TABLE wallets ADD CONSTRAINT check_user_id_for_humans CHECK (
    wallet_type IN ('system', 'platform', 'escrow') OR user_id IS NOT NULL
);

-- ============================================================================
-- TABLE: wallet_ledger
-- Append-only ledger for complete financial traceability
-- Every financial operation creates an immutable ledger entry
-- ============================================================================
CREATE TABLE IF NOT EXISTS wallet_ledger (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id           UUID NOT NULL REFERENCES wallets(id),
    transaction_id      UUID REFERENCES transactions(id),    -- Related transaction (nullable for system entries)
    credit_amount       BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),  -- Amount credited to wallet
    debit_amount        BIGINT NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),   -- Amount debited from wallet
    currency_id         UUID NOT NULL REFERENCES currencies(id),
    balance_before      BIGINT NOT NULL,                     -- Total balance before operation
    balance_after       BIGINT NOT NULL,                     -- Total balance after operation
    available_before    BIGINT NOT NULL,                     -- Available balance before operation
    available_after     BIGINT NOT NULL,                     -- Available balance after operation
    frozen_before       BIGINT NOT NULL,                     -- Frozen balance before operation
    frozen_after        BIGINT NOT NULL,                     -- Frozen balance after operation
    operation_type      VARCHAR(32) NOT NULL,                -- 'deposit', 'withdraw', 'freeze', 'unfreeze', 'escrow_release', 'refund', 'transfer_in', 'transfer_out', 'reconciliation', 'admin_adjustment'
    description         TEXT,
    reference_id        VARCHAR(128),                        -- External reference (correlation ID)
    created_by          UUID REFERENCES users(id),           -- Who initiated the operation (NULL = system)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT ck_ledger_credit_or_debit CHECK (
        (credit_amount > 0 AND debit_amount = 0) OR
        (credit_amount = 0 AND debit_amount > 0) OR
        (credit_amount = 0 AND debit_amount = 0)  -- Allow zero for informational entries (reconciliation)
    )
);

-- Indexes for ledger queries
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet ON wallet_ledger(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_transaction ON wallet_ledger(transaction_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_currency ON wallet_ledger(currency_id);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_operation ON wallet_ledger(operation_type);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created ON wallet_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_date ON wallet_ledger(wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_reference ON wallet_ledger(reference_id);

-- ============================================================================
-- TABLE: financial_audit_logs
-- Security audit trail for all financial operations
-- Immutable log for compliance and forensic analysis
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_audit_logs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type          VARCHAR(64) NOT NULL,                -- e.g. 'wallet_created', 'balance_changed', 'escrow_released', 'reconciliation_run'
    wallet_id           UUID REFERENCES wallets(id),
    user_id             UUID REFERENCES users(id),           -- The user whose wallet was affected
    actor_id            UUID REFERENCES users(id),           -- The user/admin who performed the action
    transaction_id      UUID REFERENCES transactions(id),    -- Related transaction
    previous_state      JSONB NOT NULL DEFAULT '{}',         -- Snapshot of state before the change
    new_state           JSONB NOT NULL DEFAULT '{}',          -- Snapshot of state after the change
    metadata            JSONB DEFAULT '{}',                  -- Additional context (IP, user-agent, device_id, etc.)
    description         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for audit queries
CREATE INDEX IF NOT EXISTS idx_financial_audit_wallet ON financial_audit_logs(wallet_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_user ON financial_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_actor ON financial_audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_event ON financial_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_financial_audit_transaction ON financial_audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_financial_audit_created ON financial_audit_logs(created_at DESC);

-- ============================================================================
-- FUNCTION: Automatically log wallet changes to financial_audit_logs
-- Trigger function for auditing wallet balance changes
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_audit_wallet_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.balance IS DISTINCT FROM NEW.balance OR
       OLD.available_balance IS DISTINCT FROM NEW.available_balance OR
       OLD.frozen_balance IS DISTINCT FROM NEW.frozen_balance THEN

        INSERT INTO financial_audit_logs (
            event_type,
            wallet_id,
            user_id,
            previous_state,
            new_state,
            description
        ) VALUES (
            'balance_changed',
            NEW.id,
            NEW.user_id,
            jsonb_build_object(
                'balance', OLD.balance,
                'available_balance', OLD.available_balance,
                'frozen_balance', OLD.frozen_balance,
                'status', OLD.status
            ),
            jsonb_build_object(
                'balance', NEW.balance,
                'available_balance', NEW.available_balance,
                'frozen_balance', NEW.frozen_balance,
                'status', NEW.status
            ),
            'Wallet balance changed via trigger'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on wallets table
DROP TRIGGER IF EXISTS trg_audit_wallet_change ON wallets;
CREATE TRIGGER trg_audit_wallet_change
    AFTER UPDATE OF balance, available_balance, frozen_balance ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_wallet_change();

-- ============================================================================
-- FUNCTION: Get current balance snapshot for a wallet (for reconciliation)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_get_wallet_snapshot(p_wallet_id UUID)
RETURNS TABLE (
    wallet_id UUID,
    total_balance BIGINT,
    available_balance BIGINT,
    frozen_balance BIGINT,
    ledger_total_credits BIGINT,
    ledger_total_debits BIGINT,
    ledger_balance BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        w.id AS wallet_id,
        w.balance AS total_balance,
        w.available_balance,
        w.frozen_balance,
        COALESCE(SUM(wl.credit_amount), 0) AS ledger_total_credits,
        COALESCE(SUM(wl.debit_amount), 0) AS ledger_total_debits,
        COALESCE(SUM(wl.credit_amount), 0) - COALESCE(SUM(wl.debit_amount), 0) AS ledger_balance
    FROM wallets w
    LEFT JOIN wallet_ledger wl ON wl.wallet_id = w.id
    WHERE w.id = p_wallet_id
    GROUP BY w.id, w.balance, w.available_balance, w.frozen_balance;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- DEFAULT DATA: Create platform wallets for default currencies
-- System wallets (platform type) are created with NULL user_id.
-- The CHECK constraint allows this: wallet_type IN ('system','escrow','platform') OR user_id IS NOT NULL
-- ============================================================================
INSERT INTO wallets (user_id, currency_id, balance, available_balance, frozen_balance, status, wallet_type)
SELECT
    NULL,  -- Platform wallets are system wallets, no user_id needed
    c.id,
    0, 0, 0,
    'active',
    'platform'
FROM currencies c
WHERE NOT EXISTS (
    SELECT 1 FROM wallets w
    WHERE w.wallet_type = 'platform' AND w.currency_id = c.id
) ON CONFLICT DO NOTHING;

-- ============================================================================
-- END OF MIGRATION 004
-- ============================================================================