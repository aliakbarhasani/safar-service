-- 028_create_inbox_table.sql
-- Idempotent Inbox (P12): کلید اصلی ترکیبی (handler_name, event_id) تضمین می‌کند
-- یک رویداد «حداکثر یکبار» توسط هر هندلر پردازش شود (Exactly-once در سطح مصرف‌کننده).
-- درج با ON CONFLICT DO NOTHING اتمیک است؛ اگر insert چیزی برنگرداند یعنی تکراری.
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS inbox_events (
    handler_name    VARCHAR(128) NOT NULL,
    event_id        VARCHAR(128) NOT NULL,
    event_type      VARCHAR(128) NOT NULL DEFAULT 'unknown',
    payload         JSONB NOT NULL DEFAULT '{}',
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (handler_name, event_id)
);

CREATE INDEX IF NOT EXISTS idx_inbox_event_type
    ON inbox_events (event_type);

CREATE INDEX IF NOT EXISTS idx_inbox_processed_at
    ON inbox_events (processed_at DESC);