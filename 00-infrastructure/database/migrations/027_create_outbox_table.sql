-- 027_create_outbox_table.sql
-- Transactional Outbox (P12): هر رویداد دامنه در «همان تراکنش» نوشتن وضعیت
-- در این جدول ثبت می‌شود؛ سپس OutboxRelay آن را به EventBus منتشر می‌کند.
-- نتیجه: هیچ رویدادی بین DB و Message Broker گم نمی‌شود (At-least-once).
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS outbox_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id    VARCHAR(128) NOT NULL,
    event_type      VARCHAR(128) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    status          VARCHAR(16) NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED')),
    retry_count     INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    available_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ایندکس اصلی Relay: واکشی دسته‌ای رکوردهای PENDING به ترتیب قدیمی‌ترین
CREATE INDEX IF NOT EXISTS idx_outbox_pending
    ON outbox_events (available_at, created_at) WHERE status = 'PENDING';

-- ردیابی رویدادهای یک Aggregate (مثلاً یک سفر)
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate
    ON outbox_events (aggregate_id, event_type);

CREATE INDEX IF NOT EXISTS idx_outbox_status
    ON outbox_events (status);