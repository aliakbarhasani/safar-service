-- ============================================================================
-- SAFAR SERVICE - PRICING QUOTES & AUDIT LOGS (FINAL SCHEMA)
-- PostgreSQL Migration 015
-- ============================================================================
-- Repair migration: the `quotes` / `pricing_audit_logs` tables (created by the
-- older 014_pricing_quotes_audit.sql) did not match the final architecture
-- (Decimal money columns, pricing_config_id reference, idempotency scope,
-- CHECK constraints for status/expires_at, immutable audit snapshot).
--
-- Because `CREATE TABLE IF NOT EXISTS` would silently keep the old columns,
-- we rebuild these two tables to the exact final schema here.
-- ============================================================================

-- (P1 — بازنویسی غیرتخریبی / Idempotent) بازنویسی شد:
-- پیش‌تر این دو جدول با `DROP TABLE IF EXISTS` حذف و از صفر ساخته می‌شدند؛ روی هر
-- دیتابیسی که داده داشت، این کار تمام رکوردهای `quotes` و `pricing_audit_logs` را
-- نابود می‌کرد. اکنون هیچ DROP ای اجرا نمی‌شود: جدول‌ها با
-- `CREATE TABLE IF NOT EXISTS` ساخته می‌شوند و ستون‌های نبوده با
-- `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` (بلوک‌های پایین‌تر) تکمیل می‌شوند.
-- نتیجه: حفظ دادهٔ موجود + اجرای چندبارهٔ بی‌خطر (Idempotent).

-- ----------------------------------------------------------------------------
-- TABLE: quotes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id          VARCHAR(100),
    pricing_config_id     UUID NOT NULL,
    service_type          VARCHAR(50)  NOT NULL,
    currency_code         VARCHAR(3)   NOT NULL DEFAULT 'IRT',
    currency_precision    INTEGER      NOT NULL DEFAULT 0,
    rounding_mode         VARCHAR(30)  NOT NULL DEFAULT 'HALF_EVEN',
    gross_amount          NUMERIC(19, 4) NOT NULL,
    discount_amount       NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    tax_amount            NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    commission_amount     NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    provider_amount       NUMERIC(19, 4) NOT NULL,
    customer_final_amount NUMERIC(19, 4) NOT NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'CREATED',
    input_snapshot        JSONB        NOT NULL,
    calculation_snapshot  JSONB        NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at            TIMESTAMPTZ  NOT NULL,
    consumed_at           TIMESTAMPTZ,
    cancelled_at          TIMESTAMPTZ,

    CONSTRAINT chk_quotes_status     CHECK (status IN ('CREATED', 'ACTIVE', 'EXPIRED', 'CONSUMED', 'CANCELLED')),
    CONSTRAINT chk_quotes_expires_at CHECK (expires_at > created_at),
    CONSTRAINT chk_quotes_nonneg     CHECK (gross_amount >= 0 AND customer_final_amount >= 0 AND provider_amount >= 0)
);

-- (P1 — Idempotent schema-repair) به‌جای حذف/بازسازی جدول، فقط ستون‌های نبوده
-- اضافه می‌شوند. روی نصب تازه بی‌اثر (no-op) و روی دیتابیس قدیمی اسکیما را ترمیم می‌کند.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS reference_id           VARCHAR(100);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS pricing_config_id      UUID;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS service_type           VARCHAR(50);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS currency_code          VARCHAR(3);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS currency_precision     INTEGER;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rounding_mode          VARCHAR(30);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS gross_amount           NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_amount        NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS tax_amount             NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS commission_amount      NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS provider_amount        NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS customer_final_amount  NUMERIC(19, 4);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS status                 VARCHAR(20);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS input_snapshot         JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS calculation_snapshot   JSONB;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_at             TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS expires_at             TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS consumed_at            TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS cancelled_at           TIMESTAMPTZ;
-- Soft Delete (P1): حذف منطقی به‌جای حذف فیزیکی داده
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ;
-- ایندکس Soft Delete برای فیلترکردن رکوردهای حذف‌شده
CREATE INDEX IF NOT EXISTS idx_quotes_deleted_at ON quotes(deleted_at);

-- Idempotency scope: unique reference_id only when present (nullable)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_reference
    ON quotes(reference_id)
    WHERE reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotes_status  ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);

-- ----------------------------------------------------------------------------
-- TABLE: pricing_audit_logs (immutable per-calculation snapshot)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_audit_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id             UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    action_type          VARCHAR(50) NOT NULL,
    rule_snapshot        JSONB       NOT NULL,
    calculation_steps    JSONB       NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_action CHECK (action_type IN ('QUOTE_GENERATED', 'QUOTE_CONSUMED', 'QUOTE_EXPIRED', 'QUOTE_CANCELLED'))
);

-- (P1 — Idempotent schema-repair) تکمیل ستون‌های نبوده بدون حذف داده
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS quote_id          UUID;
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS action_type       VARCHAR(50);
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS rule_snapshot     JSONB;
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS calculation_steps JSONB;
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ;
-- Soft Delete (P1): حذف منطقی به‌جای حذف فیزیکی داده
ALTER TABLE pricing_audit_logs ADD COLUMN IF NOT EXISTS deleted_at        TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pricing_audit_quote     ON pricing_audit_logs(quote_id);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_created   ON pricing_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_deleted   ON pricing_audit_logs(deleted_at);