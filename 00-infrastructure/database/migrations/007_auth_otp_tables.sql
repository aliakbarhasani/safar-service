-- ============================================================================
-- SAFAR SERVICE - AUTH & OTP TABLES
-- PostgreSQL Migration 007
-- ============================================================================
-- This migration creates authentication-related tables for OTP-based login
-- and user session management.
-- ============================================================================

BEGIN;

-- ============================================================================
-- TABLE: otp_codes
-- One-Time Password codes for phone-based authentication
-- ============================================================================
CREATE TABLE IF NOT EXISTS otp_codes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number    VARCHAR(20) NOT NULL,
    code_hash       VARCHAR(255) NOT NULL,
    type            VARCHAR(32) NOT NULL DEFAULT 'login',
    expires_at      TIMESTAMPTZ NOT NULL,
    is_used         BOOLEAN NOT NULL DEFAULT FALSE,
    attempts        SMALLINT NOT NULL DEFAULT 0,
    max_attempts    SMALLINT NOT NULL DEFAULT 5,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_otp_codes_phone_type ON otp_codes(phone_number, type);
CREATE INDEX IF NOT EXISTS idx_otp_codes_phone ON otp_codes(phone_number);
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires ON otp_codes(expires_at) WHERE is_used = FALSE;

-- ============================================================================
-- TABLE: user_sessions
-- Active user sessions with JWT token tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL,
    phone_number    VARCHAR(20) NOT NULL,
    token           TEXT NOT NULL,
    refresh_token   TEXT,
    role            VARCHAR(20) NOT NULL DEFAULT 'rider',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active) WHERE is_active = TRUE;

-- Trigger for auto-updating updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_otp_codes_update') THEN
        CREATE TRIGGER trg_otp_codes_update BEFORE UPDATE ON otp_codes FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_sessions_update') THEN
        CREATE TRIGGER trg_user_sessions_update BEFORE UPDATE ON user_sessions FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
    END IF;
END $$;

COMMIT;