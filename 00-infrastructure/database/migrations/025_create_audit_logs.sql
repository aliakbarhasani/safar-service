-- 025_create_audit_logs.sql
-- Audit trail table for security and business event tracking

CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name      VARCHAR(255) NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}',
    correlation_id  UUID,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_event_name
    ON audit_logs (event_name);

CREATE INDEX IF NOT EXISTS idx_audit_correlation_id
    ON audit_logs (correlation_id);

CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit_logs (created_at DESC);
