-- ============================================================================
-- SAFAR SERVICE - USER PROFILES & SETTINGS
-- PostgreSQL Migration 009
-- ============================================================================
-- Separation of identity/settings from core auth users table for scalability
-- ============================================================================

-- ============================================================================
-- TABLE: user_profiles
-- Extended user identity information
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id         UUID PRIMARY KEY REFERENCES users(id),
    first_name      VARCHAR(100),
    last_name       VARCHAR(100),
    email           VARCHAR(255) UNIQUE,
    avatar_url      TEXT,
    national_code   VARCHAR(20),
    document_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON user_profiles(email);
CREATE INDEX IF NOT EXISTS idx_user_profiles_document ON user_profiles(document_status);

-- ============================================================================
-- TABLE: user_settings
-- User preferences and localization
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_settings (
    user_id             UUID PRIMARY KEY REFERENCES users(id),
    language            VARCHAR(10) NOT NULL DEFAULT 'fa',
    currency            VARCHAR(10) NOT NULL DEFAULT 'IRR',
    country             VARCHAR(10) NOT NULL DEFAULT 'IR',
    timezone            VARCHAR(50) NOT NULL DEFAULT 'Asia/Tehran',
    notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);