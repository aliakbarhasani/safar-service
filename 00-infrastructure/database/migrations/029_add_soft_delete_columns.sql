-- ============================================================================
-- SAFAR SERVICE - SOFT DELETE COLUMNS (PostgreSQL Migration 029)
-- ============================================================================
-- (P1) به‌جای حذف فیزیکی رکوردها، ستون `deleted_at` اضافه می‌شود تا حذف منطقی
-- (Soft Delete) ممکن شود و دادهٔ تاریخی از بین نرود.
--
-- این migration کاملاً غیرتخریبی و Idempotent است:
--   * هیچ DROP / TRUNCATE / DELETE ای اجرا نمی‌شود
--   * فقط روی جدول‌هایی عمل می‌کند که واقعاً وجود دارند
--   * اگر ستون/ایندکس از قبل موجود باشد، بی‌اثر (no-op) است
--   * اجرای چندباره کاملاً بی‌خطر است
--
-- جدول‌های دفتر کل و لاگ‌های تغییرناپذیر عمداً کنار گذاشته شده‌اند تا حسابداری
-- دست‌کاری‌ناپذیر بماند:
--   wallet_ledger, transactions, financial_audit_logs, escrow_transactions,
--   audit_logs, security_audit_logs, pricing_audit_logs, login_history
-- ============================================================================

DO $$
DECLARE
    tbl     text;
    targets text[] := ARRAY[
        'users', 'user_profiles', 'user_settings',
        'drivers', 'driver_documents', 'driver_vehicles',
        'trips', 'rides',
        'wallets',
        'notifications', 'reviews',
        'coupons', 'user_coupons', 'promo_codes',
        'devices', 'user_devices',
        'tickets', 'ticket_messages',
        'addresses', 'files',
        'pricing_configs',
        'outbox_events', 'inbox_events'
    ];
BEGIN
    FOREACH tbl IN ARRAY targets LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = tbl
              AND table_type = 'BASE TABLE'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ',
                tbl
            );
            -- ایندکس جزئی برای کارایی کوئری «فقط رکوردهای فعال»
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS idx_%s_deleted_at ON %I (deleted_at)',
                tbl, tbl
            );
            RAISE NOTICE 'soft-delete ensured: %', tbl;
        ELSE
            RAISE NOTICE 'skipped (table not found): %', tbl;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- END OF MIGRATION 029
-- ============================================================================
