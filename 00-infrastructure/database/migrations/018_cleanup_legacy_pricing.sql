-- ============================================================================
-- SAFAR SERVICE - LEGACY PRICING TABLES CLEANUP (PostgreSQL Migration 018)
-- ============================================================================
-- PURPOSE:
--   The consolidated pricing architecture now persists ONLY to the tables:
--       quotes, pricing_configs, pricing_audit_logs    (migrations 013/015)
--   The legacy V1.0 pricing tables are no longer written by any active path
--   and are kept only for historical reference.
--
--   This migration RETIRES the legacy tables after a verified database backup.
--
-- !! DO NOT APPLY until a backup has been taken and the quotes-based
--    pipeline is confirmed as the single source of truth.               !!
--
-- ============================================================================

-- ============================================================================
-- (P1 — بازنویسی غیرتخریبی / Idempotent)
-- پیش‌تر این دو جدول میراثی با `DROP TABLE ... CASCADE` به‌طور فیزیکی حذف می‌شدند
-- که برگشت‌ناپذیر بود و با CASCADE می‌توانست اشیای وابسته (index/view/FK) را هم
-- از بین ببرد. اکنون هیچ چیزی حذف نمی‌شود؛ جدول‌های میراثی صرفاً «بازنشسته»
-- می‌شوند (تغییر نام به legacy_*_deprecated) تا داده برای مرجع تاریخی حفظ بماند.
-- عملیات داخل بلوک‌های محافظت‌شده اجرا می‌شود تا اجرای چندباره بی‌خطر باشد.
-- ============================================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'price_quotes'
          AND table_type = 'BASE TABLE'
    ) THEN
        ALTER TABLE price_quotes RENAME TO legacy_price_quotes_deprecated;
        RAISE NOTICE 'price_quotes -> legacy_price_quotes_deprecated (data preserved)';
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'pricing_rules'
          AND table_type = 'BASE TABLE'
    ) THEN
        ALTER TABLE pricing_rules RENAME TO legacy_pricing_rules_deprecated;
        RAISE NOTICE 'pricing_rules -> legacy_pricing_rules_deprecated (data preserved)';
    END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION 018
-- ============================================================================