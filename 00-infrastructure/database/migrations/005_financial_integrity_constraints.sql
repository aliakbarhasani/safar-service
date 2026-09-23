-- ============================================================================
-- SAFAR SERVICE - FINANCIAL INTEGRITY & STRICT CONSTRAINTS
-- PostgreSQL Migration 005
-- ============================================================================
-- This migration enforces global financial standards:
--   • NUMERIC(20,8) for all monetary columns (NO float/real types)
--   • Strict CHECK constraints preventing negative balances
--   • Append-only protection on wallet_ledger (block UPDATE/DELETE)
--   • Payment gateway fields for banking integration
--   • UNIQUE reference_id on transactions
--   • Complete Escrow lifecycle support
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- (P1 — Idempotent) PostgreSQL دستور `CREATE TYPE IF NOT EXISTS` ندارد؛ بنابراین
-- ساخت هر enum داخل بلوک محافظت‌شده انجام می‌شود تا اجرای چندبارهٔ migration خطا ندهد.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_gateway') THEN
        CREATE TYPE payment_gateway AS ENUM (
            'zarinpal',    -- درگاه پرداخت زرین‌پال
            'idpay',       -- درگاه پرداخت آیدی پی
            'payv1',       -- پی وی ون
            'stripe',      -- Stripe (International)
            'paypal',      -- PayPal (International)
            'wallet',      -- Internal wallet transfer
            'bank_transfer', -- Direct bank transfer
            'cash'         -- Cash payment
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'escrow_status') THEN
        CREATE TYPE escrow_status AS ENUM (
            'active',       -- وجوه مسدود شده و فعال
            'released',     -- آزاد شده به مقصد
            'refunded',     -- بازگشت داده شده به فرستنده
            'expired',      -- منقضی شده
            'disputed',     -- مورد اختلاف
            'resolved'      -- اختلاف حل شده
        );
    END IF;
END $$;

-- ============================================================================
-- TABLE: escrow_transactions
-- Complete lifecycle tracking for escrow operations
-- ============================================================================
CREATE TABLE IF NOT EXISTS escrow_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID REFERENCES trips(id),
    payer_id            UUID NOT NULL REFERENCES users(id),     -- Who paid (passenger)
    payee_id            UUID REFERENCES users(id),              -- Who receives (driver, NULL if TBD)
    amount              NUMERIC(20,8) NOT NULL CHECK (amount > 0),
    currency_id         UUID NOT NULL REFERENCES currencies(id),
    platform_commission NUMERIC(20,8) NOT NULL DEFAULT 0 CHECK (platform_commission >= 0),
    net_amount          NUMERIC(20,8) NOT NULL CHECK (net_amount >= 0),
    status              escrow_status NOT NULL DEFAULT 'active',
    source_wallet_id    UUID NOT NULL REFERENCES wallets(id),  -- Wallet where funds were frozen
    destination_wallet_id UUID REFERENCES wallets(id),         -- Wallet where funds were released
    platform_wallet_id  UUID REFERENCES wallets(id),            -- Platform commission wallet
    description         TEXT,
    released_at         TIMESTAMPTZ,
    refunded_at         TIMESTAMPTZ,
    expired_at          TIMESTAMPTZ,
    disputed_at         TIMESTAMPTZ,
    resolved_at         TIMESTAMPTZ,
    dispute_reason      TEXT,
    resolution_notes    TEXT,
    resolved_by         UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                          -- Soft Delete (only for administrative cleanup)
);

-- (P1 — Idempotent) ایندکس‌ها با IF NOT EXISTS تا اجرای چندباره خطا ندهد
CREATE INDEX IF NOT EXISTS idx_escrow_trip ON escrow_transactions(trip_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payer ON escrow_transactions(payer_id);
CREATE INDEX IF NOT EXISTS idx_escrow_payee ON escrow_transactions(payee_id);
CREATE INDEX IF NOT EXISTS idx_escrow_status ON escrow_transactions(status);
CREATE INDEX IF NOT EXISTS idx_escrow_created ON escrow_transactions(created_at DESC);

-- ============================================================================
-- STRICT CONSTRAINTS ON wallets TABLE
-- ============================================================================

-- Drop the audit trigger and function before changing column types
-- (PostgreSQL blocks ALTER TABLE ... ALTER COLUMN TYPE when a trigger
--  references the column being altered via UPDATE OF column_list)
DROP TRIGGER IF EXISTS trg_audit_wallet_change ON wallets;
DROP FUNCTION IF EXISTS fn_audit_wallet_change;

-- 1. Convert balance columns to NUMERIC(20,8)
-- Safe because BIGINT values fit in NUMERIC(20,0)
ALTER TABLE wallets
    ALTER COLUMN balance TYPE NUMERIC(20,8),
    ALTER COLUMN available_balance TYPE NUMERIC(20,8),
    ALTER COLUMN frozen_balance TYPE NUMERIC(20,8);

-- 2. Strict non-negative CHECK constraints
-- (P1 — Idempotent) `ADD CONSTRAINT` در اجرای مجدد خطا می‌دهد؛ بنابراین هر
-- constraint ابتدا با IF EXISTS حذف و سپس بازسازی می‌شود.
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_balance_non_negative;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_available_balance_non_negative;
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS check_frozen_balance_non_negative;

ALTER TABLE wallets
    ADD CONSTRAINT check_balance_non_negative CHECK (balance >= 0),
    ADD CONSTRAINT check_available_balance_non_negative CHECK (available_balance >= 0),
    ADD CONSTRAINT check_frozen_balance_non_negative CHECK (frozen_balance >= 0);

-- 3. Validate total balance = available + frozen (already exists, re-assert)
-- Ensure the constraint is enforced (P1 — Idempotent: حذف محافظت‌شده پیش از بازسازی)
ALTER TABLE wallets DROP CONSTRAINT IF EXISTS ck_wallet_balance_total;

ALTER TABLE wallets
    ADD CONSTRAINT ck_wallet_balance_total
    CHECK (balance = available_balance + frozen_balance);

-- Recreate the audit trigger function and trigger on wallets table
-- (was dropped above to allow column type changes)
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

DROP TRIGGER IF EXISTS trg_audit_wallet_change ON wallets;
CREATE TRIGGER trg_audit_wallet_change
    AFTER UPDATE OF balance, available_balance, frozen_balance ON wallets
    FOR EACH ROW
    EXECUTE FUNCTION fn_audit_wallet_change();

-- ============================================================================
-- STRICT CONSTRAINTS ON transactions TABLE
-- ============================================================================

-- 1. Convert amount to NUMERIC(20,8)
ALTER TABLE transactions
    ALTER COLUMN amount TYPE NUMERIC(20,8);

-- 2. Add payment gateway columns
ALTER TABLE transactions
    ADD COLUMN IF NOT EXISTS payment_gateway payment_gateway,
    ADD COLUMN IF NOT EXISTS gateway_transaction_id VARCHAR(255),
    ADD COLUMN IF NOT EXISTS gateway_status VARCHAR(64),
    ADD COLUMN IF NOT EXISTS gateway_response JSONB DEFAULT '{}';

-- 3. UNIQUE index on reference_id (only when NOT NULL)
DROP INDEX IF EXISTS idx_transactions_reference_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_reference_unique
    ON transactions(reference_id) WHERE reference_id IS NOT NULL;

-- 4. Index on gateway fields
CREATE INDEX IF NOT EXISTS idx_transactions_gateway
    ON transactions(payment_gateway, gateway_transaction_id);
CREATE INDEX IF NOT EXISTS idx_transactions_gateway_status
    ON transactions(gateway_status);

-- ============================================================================
-- STRICT CONSTRAINTS ON wallet_ledger TABLE
-- ============================================================================

-- 1. Convert all numeric columns to NUMERIC(20,8)
ALTER TABLE wallet_ledger
    ALTER COLUMN credit_amount TYPE NUMERIC(20,8),
    ALTER COLUMN debit_amount TYPE NUMERIC(20,8),
    ALTER COLUMN balance_before TYPE NUMERIC(20,8),
    ALTER COLUMN balance_after TYPE NUMERIC(20,8),
    ALTER COLUMN available_before TYPE NUMERIC(20,8),
    ALTER COLUMN available_after TYPE NUMERIC(20,8),
    ALTER COLUMN frozen_before TYPE NUMERIC(20,8),
    ALTER COLUMN frozen_after TYPE NUMERIC(20,8);

-- 2. Strict non-negative CHECK constraints on ledger
-- (P1 — Idempotent) ابتدا حذف محافظت‌شده (IF EXISTS) و سپس بازسازی constraint
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS check_ledger_credit_non_negative;
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS check_ledger_debit_non_negative;

ALTER TABLE wallet_ledger
    ADD CONSTRAINT check_ledger_credit_non_negative CHECK (credit_amount >= 0),
    ADD CONSTRAINT check_ledger_debit_non_negative CHECK (debit_amount >= 0);

-- 3. (P1 — بازنویسی غیرتخریبی) کیف پول/دفتر کل تنها-افزودنی (append-only) است.
-- SECURITY/STABILITY: در نسخهٔ قبلی اینجا ستون `deleted_at` با دستور مخرب
-- `ALTER TABLE wallet_ledger DROP COLUMN deleted_at` به‌صورت فیزیکی حذف می‌شد.
-- حذف فیزیکی ستون برگشت‌ناپذیر است و می‌تواند در محیط‌هایی که این ستون را
-- از قبل داشتند باعث از دست رفتن داده شود؛ بنابراین آن دستور به‌کلی حذف شد.
-- اصل «تنها-افزودنی» بودن دفتر کل، ساختاری و قطعی تضمین شده است توسط تریگر
-- `fn_prevent_ledger_mutation` (پایین‌تر) که هر UPDATE/DELETE را مسدود می‌کند؛
-- پس ستون `deleted_at` بی‌اثر (inert) است و حذف فیزیکی آن ضرورتی ندارد.
-- Soft Delete عمداً روی دفتر کل اعمال نمی‌شود (داده‌های مالی باید تغییرناپذیر بمانند).
-- (در این migration هیچ دستور تخریبی باقی نمانده است.)

-- ============================================================================
-- APPEND-ONLY TRIGGER FOR wallet_ledger
-- Blocks any UPDATE or DELETE operations
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_prevent_ledger_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'LEDGER_MUTATION_DENIED: UPDATE operations are forbidden on wallet_ledger (append-only). Record ID: %', OLD.id
            USING HINT = 'wallet_ledger is an append-only table. INSERT only.';
    ELSIF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'LEDGER_MUTATION_DENIED: DELETE operations are forbidden on wallet_ledger (append-only). Record ID: %', OLD.id
            USING HINT = 'wallet_ledger is an append-only table. INSERT only.';
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_prevent_ledger_update ON wallet_ledger;
CREATE TRIGGER trg_prevent_ledger_update
    BEFORE UPDATE ON wallet_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_ledger_mutation();

DROP TRIGGER IF EXISTS trg_prevent_ledger_delete ON wallet_ledger;
CREATE TRIGGER trg_prevent_ledger_delete
    BEFORE DELETE ON wallet_ledger
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_ledger_mutation();

-- ============================================================================
-- REFERENCE_ID UNIQUE ON wallet_ledger
-- ============================================================================
DROP INDEX IF EXISTS idx_wallet_ledger_reference_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_ledger_reference_unique
    ON wallet_ledger(reference_id) WHERE reference_id IS NOT NULL;

-- ============================================================================
-- IMPROVED AUDIT TRIGGER ON financial_audit_logs (also append-only)
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE EXCEPTION 'AUDIT_MUTATION_DENIED: % operations are forbidden on financial_audit_logs', TG_OP
            USING HINT = 'financial_audit_logs is append-only. INSERT only.';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_update ON financial_audit_logs;
CREATE TRIGGER trg_prevent_audit_update
    BEFORE UPDATE ON financial_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_mutation();

DROP TRIGGER IF EXISTS trg_prevent_audit_delete ON financial_audit_logs;
CREATE TRIGGER trg_prevent_audit_delete
    BEFORE DELETE ON financial_audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION fn_prevent_audit_mutation();

-- ============================================================================
-- CRITICAL RECONCILIATION EVENT
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_create_reconciliation_event(
    p_wallet_id UUID,
    p_discrepancy NUMERIC(20,8),
    p_wallet_balance NUMERIC(20,8),
    p_ledger_balance NUMERIC(20,8)
) RETURNS VOID AS $$
BEGIN
    INSERT INTO financial_audit_logs (
        event_type,
        wallet_id,
        previous_state,
        new_state,
        description
    ) VALUES (
        'CRITICAL_RECONCILIATION_MISMATCH',
        p_wallet_id,
        jsonb_build_object('wallet_balance', p_wallet_balance),
        jsonb_build_object('ledger_balance', p_ledger_balance, 'discrepancy', p_discrepancy),
        format('CRITICAL: Wallet/Ledger mismatch of %s units. Wallet= %s, Ledger= %s',
               p_discrepancy, p_wallet_balance, p_ledger_balance)
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- END OF MIGRATION 005
-- ============================================================================