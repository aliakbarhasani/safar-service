-- 025_create_audit_logs.sql
-- Audit trail table for security and business event tracking

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name      VARCHAR(255) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    correlation_id  UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- (P1 — Idempotent schema-repair) اگر جدول `audit_logs` از migrationهای قدیمی‌تر با
-- اسکیمای متفاوت از قبل وجود داشته باشد، `CREATE TABLE IF NOT EXISTS` آن را ترمیم
-- نمی‌کند و ساخت ایندکس‌های پایین‌تر با خطای «column does not exist» شکست می‌خورد.
-- بنابراین ستون‌های نبوده به‌صورت غیرتخریبی (بدون حذف هیچ داده‌ای) اضافه می‌شوند.
-- ستون‌ها عمداً nullable اضافه می‌شوند تا روی جدولِ دارای داده خطا ندهند.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS event_name     VARCHAR(255);
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS payload        JSONB;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS correlation_id UUID;
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_audit_event_name
    ON audit_logs (event_name);

CREATE INDEX IF NOT EXISTS idx_audit_correlation_id
    ON audit_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit_logs (created_at DESC);
