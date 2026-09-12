/**
 * 023_create_driver_location_history.sql - Write-Behind Location History (P3-2)
 *
 * جدول تاریخچه مکانی رانندگان. داده‌ها به صورت Write-Behind از Redis به
 * این جدول منتقل می‌شوند (هر ۱ دقیقه توسط Background Worker).
 *
 * STATUS: EXECUTED AUTOMATICALLY — در MIGRATION_ORDER قرار دارد.
 */

CREATE TABLE IF NOT EXISTS driver_location_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL,
    latitude        DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_processed    BOOLEAN NOT NULL DEFAULT FALSE
);

-- ایندکس ترکیبی برای جستجوی مسیر یک راننده در بازه زمانی
CREATE INDEX IF NOT EXISTS idx_location_history_driver_time
    ON driver_location_history (driver_id, recorded_at DESC);

-- ایندکس برای یافتن رکوردهای پردازش‌نشده (جلوگیری از اسکن کامل جدول)
CREATE INDEX IF NOT EXISTS idx_location_history_unprocessed
    ON driver_location_history (recorded_at ASC)
    WHERE is_processed = FALSE;

COMMENT ON TABLE driver_location_history IS 'Write-Behind location history synced from Redis buffer';
