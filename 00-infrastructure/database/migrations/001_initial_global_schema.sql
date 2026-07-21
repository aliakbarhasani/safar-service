-- ============================================================================
-- SAFAR SERVICE - INITIAL GLOBAL SCHEMA
-- PostgreSQL Migration 001
-- ============================================================================
-- This migration creates the foundational database structure for the Safar
-- Service super application. It follows strict architectural rules:
--   • UUID primary keys for all tables
--   • Soft delete (deleted_at) on all core tables
--   • Multi-country and multi-currency support from day one
--   • Proper indexing on foreign keys and high-query fields
--   • JSONB for dynamic configuration storage
--   • All status values as ENUM types for consistency
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE user_role AS ENUM ('passenger', 'driver', 'provider', 'admin', 'super_admin');
CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'banned');

CREATE TYPE driver_account_status AS ENUM ('pending_verification', 'verified', 'rejected', 'suspended', 'blocked');
CREATE TYPE driver_operational_status AS ENUM ('offline', 'online', 'busy', 'on_trip');

CREATE TYPE trip_status AS ENUM (
    'requested',
    'driver_assigned',
    'driver_arrived',
    'passenger_boarded',
    'in_progress',
    'finished',
    'cancelled',
    'security_investigation',
    'emergency_stop'
);

CREATE TYPE trip_payment_method AS ENUM ('wallet', 'cash', 'pay_later');
CREATE TYPE service_type AS ENUM ('urban_taxi', 'intercity_taxi', 'freight', 'delivery');

CREATE TYPE transaction_type AS ENUM ('CREDIT', 'DEBIT');
CREATE TYPE transaction_status AS ENUM ('pending', 'success', 'failed');

CREATE TYPE driver_document_type AS ENUM ('identity_card', 'driving_license', 'vehicle_card', 'operation_permit', 'selfie');

-- ============================================================================
-- TABLE: currencies
-- Multi-currency support for global expansion
-- ============================================================================
CREATE TABLE currencies (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(3) NOT NULL UNIQUE,          -- ISO 4217 (IRT, USD, AFN, EUR, etc.)
    name            VARCHAR(64) NOT NULL,
    symbol          VARCHAR(8) NOT NULL,
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    exchange_rate   DECIMAL(18, 6) NOT NULL DEFAULT 1.0, -- نسبت به ارز پایه
    decimal_places  SMALLINT NOT NULL DEFAULT 2,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_currencies_code ON currencies(code);
CREATE INDEX idx_currencies_is_default ON currencies(is_default) WHERE is_default = TRUE;

-- ============================================================================
-- TABLE: countries
-- Multi-country support
-- ============================================================================
CREATE TABLE countries (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code            VARCHAR(2) NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2 (AF, IR, US, etc.)
    name            VARCHAR(128) NOT NULL,
    phone_prefix    VARCHAR(5) NOT NULL,
    currency_id     UUID REFERENCES currencies(id),
    timezone        VARCHAR(64) NOT NULL DEFAULT 'UTC',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_countries_code ON countries(code);

-- ============================================================================
-- TABLE: users
-- Core user table for passengers, providers, admins
-- ============================================================================
CREATE TABLE users (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name        VARCHAR(128) NOT NULL,
    last_name         VARCHAR(128) NOT NULL,
    phone_number      VARCHAR(20) NOT NULL,
    email             VARCHAR(255),
    password_hash     VARCHAR(255) NOT NULL,
    role              user_role NOT NULL DEFAULT 'passenger',
    status            user_status NOT NULL DEFAULT 'active',
    country_id        UUID REFERENCES countries(id),
    preferred_currency_id UUID REFERENCES currencies(id),
    avatar_url        VARCHAR(512),
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at     TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ                          -- Soft Delete
);

CREATE UNIQUE INDEX idx_users_phone ON users(phone_number) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_country ON users(country_id);
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: drivers
-- Complete driver profile with all required fields
-- ============================================================================
CREATE TABLE drivers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id),
    first_name                  VARCHAR(128) NOT NULL,
    last_name                   VARCHAR(128) NOT NULL,
    phone_number                VARCHAR(20) NOT NULL,
    date_of_birth               DATE NOT NULL,
    address                     TEXT,

    -- Account & operational status
    account_status              driver_account_status NOT NULL DEFAULT 'pending_verification',
    operational_status          driver_operational_status NOT NULL DEFAULT 'offline',

    -- Statistics
    rating                      DECIMAL(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5),
    rating_count                INTEGER NOT NULL DEFAULT 0,
    completed_trips             INTEGER NOT NULL DEFAULT 0,
    cancelled_trips             INTEGER NOT NULL DEFAULT 0,

    -- Location (PostGIS-ready)
    current_location_latitude   DECIMAL(10, 7),
    current_location_longitude  DECIMAL(10, 7),
    last_seen_at                TIMESTAMPTZ,

    -- Vehicle information
    vehicle_type                VARCHAR(64) NOT NULL,
    license_plate               VARCHAR(20) NOT NULL,
    chassis_number              VARCHAR(64),
    vehicle_identification_number VARCHAR(64) NOT NULL,
    license_number              VARCHAR(64) NOT NULL,
    identity_card_number        VARCHAR(64) NOT NULL,

    -- Document URLs
    identity_card_url           VARCHAR(512),
    selfie_url                  VARCHAR(512),
    driving_license_url         VARCHAR(512),
    transit_pass_url            VARCHAR(512),
    vehicle_card_url            VARCHAR(512),

    -- Document expiry dates
    license_expiry_date         DATE,
    insurance_expiry_date       DATE,
    registration_expiry_date    DATE,

    -- Country reference
    country_id                  UUID REFERENCES countries(id),

    -- Audit fields
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ               -- Soft Delete
);

CREATE UNIQUE INDEX idx_drivers_user ON drivers(user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_drivers_phone ON drivers(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_drivers_account_status ON drivers(account_status);
CREATE INDEX idx_drivers_operational_status ON drivers(operational_status) WHERE operational_status = 'online';
CREATE INDEX idx_drivers_location ON drivers(current_location_latitude, current_location_longitude);
CREATE INDEX idx_drivers_vehicle_type ON drivers(vehicle_type);
CREATE INDEX idx_drivers_deleted_at ON drivers(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: driver_documents
-- Separate table for driver documents (one-to-many relationship)
-- ============================================================================
CREATE TABLE driver_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id       UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    document_type   driver_document_type NOT NULL,
    url             VARCHAR(512) NOT NULL,
    verified_at     TIMESTAMPTZ,
    verified_by     UUID REFERENCES users(id),
    expires_at      DATE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_driver_documents_driver ON driver_documents(driver_id);
CREATE INDEX idx_driver_documents_type ON driver_documents(driver_id, document_type);

-- ============================================================================
-- TABLE: trips
-- Full trip lifecycle matching the 9-state state machine
-- ============================================================================
CREATE TABLE trips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    passenger_id        UUID NOT NULL REFERENCES users(id),
    driver_id           UUID REFERENCES drivers(id),

    -- Route
    origin_address      TEXT NOT NULL,
    origin_latitude     DECIMAL(10, 7),
    origin_longitude    DECIMAL(10, 7),
    destination_address TEXT NOT NULL,
    destination_latitude DECIMAL(10, 7),
    destination_longitude DECIMAL(10, 7),

    -- Status & phase (9-state machine)
    status              trip_status NOT NULL DEFAULT 'requested',
    trip_phase          trip_status NOT NULL DEFAULT 'requested',

    -- Financial
    payment_method      trip_payment_method NOT NULL DEFAULT 'wallet',
    estimated_cost      BIGINT NOT NULL DEFAULT 0,
    final_cost          BIGINT NOT NULL DEFAULT 0,
    base_fare           BIGINT NOT NULL DEFAULT 0,
    commission_rate     DECIMAL(5, 2) NOT NULL DEFAULT 0,
    commission_amount   BIGINT NOT NULL DEFAULT 0,
    driver_earning      BIGINT NOT NULL DEFAULT 0,
    currency_id         UUID REFERENCES currencies(id),

    -- Service type
    service_type        service_type NOT NULL DEFAULT 'urban_taxi',

    -- Cancellation
    cancel_reason       TEXT,
    cancelled_by        VARCHAR(20) CHECK (cancelled_by IN ('user', 'driver', 'system', 'support')),

    -- Security
    passenger_boarded   BOOLEAN NOT NULL DEFAULT FALSE,
    security_report     JSONB,
    emergency_flag      BOOLEAN NOT NULL DEFAULT FALSE,
    support_ticket_id   VARCHAR(64),

    -- Country reference
    country_id          UUID REFERENCES countries(id),

    -- Audit fields
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                     -- Soft Delete
);

CREATE INDEX idx_trips_passenger ON trips(passenger_id);
CREATE INDEX idx_trips_driver ON trips(driver_id);
CREATE INDEX idx_trips_status ON trips(status);
CREATE INDEX idx_trips_created_at ON trips(created_at DESC);
CREATE INDEX idx_trips_passenger_status ON trips(passenger_id, status);
CREATE INDEX idx_trips_driver_status ON trips(driver_id, status);
CREATE INDEX idx_trips_deleted_at ON trips(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: wallets
-- Multi-currency wallet per user
-- ============================================================================
CREATE TABLE wallets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    currency_id     UUID NOT NULL REFERENCES currencies(id),
    balance         BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'frozen')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT unique_user_currency UNIQUE (user_id, currency_id)
);

CREATE INDEX idx_wallets_user ON wallets(user_id);
CREATE INDEX idx_wallets_currency ON wallets(currency_id);
CREATE INDEX idx_wallets_deleted_at ON wallets(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: transactions
-- All financial transactions (wallet charges, trip payments, etc.)
-- ============================================================================
CREATE TABLE transactions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id       UUID NOT NULL REFERENCES wallets(id),
    trip_id         UUID REFERENCES trips(id),
    amount          BIGINT NOT NULL,
    type            transaction_type NOT NULL,
    description     TEXT,
    status          transaction_status NOT NULL DEFAULT 'success',
    reference_id    VARCHAR(128),                           -- External reference (payment gateway, etc.)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet ON transactions(wallet_id);
CREATE INDEX idx_transactions_trip ON transactions(trip_id);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);
CREATE INDEX idx_transactions_type ON transactions(wallet_id, type);

-- ============================================================================
-- TABLE: system_configs
-- Dynamic configuration storage (no hardcode)
-- ============================================================================
CREATE TABLE system_configs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category        VARCHAR(64) NOT NULL,                   -- e.g. 'pricing', 'commission', 'features'
    key             VARCHAR(128) NOT NULL,
    value           JSONB NOT NULL,                         -- Flexible value storage
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_config_key UNIQUE (category, key)
);

CREATE INDEX idx_system_configs_category ON system_configs(category);

-- ============================================================================
-- TABLE: audit_logs
-- Central audit trail for all important events
-- ============================================================================
CREATE TABLE audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type      VARCHAR(64) NOT NULL,                   -- e.g. 'TripCreated', 'WalletCharged'
    entity_type     VARCHAR(64) NOT NULL,                   -- e.g. 'trip', 'wallet', 'user'
    entity_id       UUID,
    actor_id        UUID REFERENCES users(id),
    metadata        JSONB,                                  -- Event-specific data
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default currencies
INSERT INTO currencies (code, name, symbol, is_default, exchange_rate, decimal_places) VALUES
    ('IRT', 'Iranian Toman', 'IRR', TRUE, 1.0, 0),
    ('USD', 'US Dollar', '$', FALSE, 0.000024, 2),
    ('EUR', 'Euro', '€', FALSE, 0.000022, 2),
    ('AFN', 'Afghan Afghani', '؋', FALSE, 0.0018, 2),
    ('AED', 'UAE Dirham', 'د.إ', FALSE, 0.000088, 2);

-- Insert default countries
INSERT INTO countries (code, name, phone_prefix, currency_id, timezone) VALUES
    ('IR', 'Iran', '+98', (SELECT id FROM currencies WHERE code = 'IRT'), 'Asia/Tehran'),
    ('AF', 'Afghanistan', '+93', (SELECT id FROM currencies WHERE code = 'AFN'), 'Asia/Kabul'),
    ('AE', 'United Arab Emirates', '+971', (SELECT id FROM currencies WHERE code = 'AED'), 'Asia/Dubai');

-- ============================================================================
-- END OF MIGRATION 001
-- ============================================================================