-- ============================================================================
-- SAFAR SERVICE - Security & Audit Tables
-- PostgreSQL Migration 011
-- ============================================================================
-- Tracks login attempts (success/failure) and security audit logs
-- NOTE: Uses `security_audit_logs` to avoid conflict with existing `audit_logs`
--       table from migration 001 (which has a different schema).
-- ============================================================================

-- ============================================================================
-- TABLE: login_history
-- Records every login attempt (OTP request, OTP verify success/failure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS login_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    phone_number    VARCHAR(20) NOT NULL,
    login_type      VARCHAR(20) NOT NULL DEFAULT 'otp',
    status          VARCHAR(20) NOT NULL DEFAULT 'success',
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    failure_reason  TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user       ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_phone      ON login_history(phone_number);
CREATE INDEX IF NOT EXISTS idx_login_history_status     ON login_history(status);
CREATE INDEX IF NOT EXISTS idx_login_history_created    ON login_history(created_at);

-- ============================================================================
-- TABLE: security_audit_logs
-- Security-focused audit trail for auth and critical actions
-- (Separate from the generic audit_logs table in migration 001)
-- ============================================================================
CREATE TABLE IF NOT EXISTS security_audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,
    module_name     VARCHAR(100) NOT NULL DEFAULT 'auth',
    entity_type     VARCHAR(100),
    entity_id       VARCHAR(100),
    old_values      JSONB,
    new_values      JSONB,
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_audit_logs_user         ON security_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_action       ON security_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_module       ON security_audit_logs(module_name);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_entity       ON security_audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created      ON security_audit_logs(created_at);