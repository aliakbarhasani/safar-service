-- ============================================================================
-- SAFAR SERVICE - PRICING ENGINE TABLES
-- PostgreSQL Migration V1.0
-- ============================================================================
-- This migration creates the pricing engine database structure for the Safar
-- Service super application. It follows strict architectural rules:
--   • Atomic migration (wrapped in BEGIN/COMMIT)
--   • UUID primary keys for all tables
--   • Soft delete (deleted_at) on core tables
--   • Immutable financial records in price_quotes
--   • Proper indexing on foreign keys and high-query fields
--   • Version tracking for audit and historical accuracy
-- ============================================================================

-- شروع تراکنش برای رعایت استاندارد Atomic بودن
BEGIN;

-- ============================================================================
-- ۱. جدول قوانین قیمت‌گذاری پایه (Pricing Rules)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    priority INT NOT NULL CHECK(priority BETWEEN 1 AND 100),
    scope_type VARCHAR(50) NOT NULL, -- Global, Country, Province, City, Zone, District, Street, Polygon, Custom Region
    scope_id UUID NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    currency_id UUID NOT NULL, -- ذخیره فقط شناسه بدون Foreign Key مستقیم
    base_fare NUMERIC(19,4) NOT NULL,
    per_km_rate NUMERIC(19,4) NOT NULL,
    per_minute_rate NUMERIC(19,4) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

-- ایجاد Partial Unique Index برای هندل کردن Soft Delete و جلوگیری از ثبت قانون تکراری فعال
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pricing_rule_active 
ON pricing_rules (scope_type, scope_id, service_type, currency_id) 
WHERE deleted_at IS NULL;

-- ============================================================================
-- ۲. جدول ضرایب پویا (Dynamic Multipliers)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dynamic_multipliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES pricing_rules(id),
    adapter_key VARCHAR(50) NOT NULL, -- traffic, weather, ai_demand
    multiplier NUMERIC(5,2) NOT NULL CHECK (multiplier > 0),
    is_active BOOLEAN DEFAULT TRUE,
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_dynamic_rule ON dynamic_multipliers(rule_id);

-- ============================================================================
-- ۳. جدول پیش‌فاکتورها (Price Quotes) - کاملاً Immutable در سطح دیتابیس
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_request_id UUID NOT NULL, -- ارتباط سست (بدون Foreign Key فیزیکی)
    price_breakdown JSONB NOT NULL,
    total_price NUMERIC(19,4) NOT NULL,
    currency_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED', 'CANCELLED')),
    expires_at TIMESTAMPTZ NOT NULL,
    
    -- فیلدهای نسخه گذاری و اسنپ‌شات برای بازسازی تاریخی دقیق قیمت
    pricing_engine_version VARCHAR(20) NOT NULL,
    rule_version INT NOT NULL,
    multiplier_version INT NOT NULL,
    algorithm_version VARCHAR(20) NOT NULL,
    config_version VARCHAR(20) NOT NULL,
    request_hash VARCHAR(64) NOT NULL, -- SHA-256 پارامترهای ورودی
    
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_quotes_expire ON price_quotes(expires_at) WHERE status = 'ACTIVE';

-- ============================================================================
-- ۴. جدول حسابرسی تغییرات (Pricing Timeline / Audit Log)
-- ============================================================================
CREATE TABLE IF NOT EXISTS pricing_timeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_id UUID NOT NULL, -- شناسه قانون یا Quote تغییر یافته
    event_type VARCHAR(50) NOT NULL, -- RuleCreated, RuleUpdated, SurgeActivated, etc.
    actor_type VARCHAR(20) NOT NULL, -- Admin, System, AI, Scheduler, API
    actor_id UUID, -- شناسه عامل تغییر دهنده (کاربر، سیستم و ...)
    old_value JSONB,
    new_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- ۵. ایجاد تابع و تریگر بروزرسانی خودکار updated_at
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ایجاد تریگرها در صورت عدم وجود
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pricing_rules_update') THEN
        CREATE TRIGGER trg_pricing_rules_update BEFORE UPDATE ON pricing_rules FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_dynamic_multipliers_update') THEN
        CREATE TRIGGER trg_dynamic_multipliers_update BEFORE UPDATE ON dynamic_multipliers FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_price_quotes_update') THEN
        CREATE TRIGGER trg_price_quotes_update BEFORE UPDATE ON price_quotes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

-- ============================================================================
-- ۶. ایجاد تریگر تضمین غیرقابل تغییر بودن (Immutability) فیلدهای مالی در Price Quote
-- ============================================================================
CREATE OR REPLACE FUNCTION prevent_quote_update()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.total_price IS DISTINCT FROM NEW.total_price OR 
        OLD.price_breakdown IS DISTINCT FROM NEW.price_breakdown OR
        OLD.currency_id IS DISTINCT FROM NEW.currency_id) THEN
        RAISE EXCEPTION 'Financial and pricing breakdown data in price_quotes is immutable and cannot be modified.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_quote_modification') THEN
        CREATE TRIGGER trg_prevent_quote_modification BEFORE UPDATE ON price_quotes FOR EACH ROW EXECUTE PROCEDURE prevent_quote_update();
    END IF;
END $$;

COMMIT;

-- ============================================================================
-- END OF MIGRATION V1.0
-- ============================================================================