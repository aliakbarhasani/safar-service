-- ============================================================================
-- SAFAR SERVICE - DRIVER MODULE POSTGRES TABLES (PostgreSQL Migration 022)
-- ============================================================================
-- PURPOSE:
--   Canonical PostgreSQL schema for the Driver module (07-driver-service).
--   Establishes `drivers`, `driver_documents` and `driver_vehicles` idempotently.
--
-- STATUS: EXECUTED AUTOMATICALLY via run-all-migrations.js (in MIGRATION_ORDER).
--   `drivers` and `driver_documents` are already created by migration 001; the
--   `CREATE TABLE IF NOT EXISTS` guards keep this migration safe on existing
--   databases while guaranteeing full availability on fresh installs.
--   `driver_vehicles` is NEW in this migration.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) drivers - complete driver profile (matches migration 001 schema)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS drivers (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID NOT NULL REFERENCES users(id),
    first_name                  VARCHAR(128) NOT NULL,
    last_name                   VARCHAR(128) NOT NULL,
    phone_number                VARCHAR(20) NOT NULL,
    date_of_birth               DATE NOT NULL,
    address                     TEXT,

    account_status              driver_account_status NOT NULL DEFAULT 'pending_verification',
    operational_status          driver_operational_status NOT NULL DEFAULT 'offline',

    rating                      DECIMAL(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5),
    rating_count                INTEGER NOT NULL DEFAULT 0,
    completed_trips             INTEGER NOT NULL DEFAULT 0,
    cancelled_trips             INTEGER NOT NULL DEFAULT 0,

    current_location_latitude   DECIMAL(10, 7),
    current_location_longitude  DECIMAL(10, 7),
    last_seen_at                TIMESTAMPTZ,

    vehicle_type                VARCHAR(64) NOT NULL,
    license_plate               VARCHAR(20) NOT NULL,
    chassis_number              VARCHAR(64),
    vehicle_identification_number VARCHAR(64) NOT NULL,
    license_number              VARCHAR(64) NOT NULL,
    identity_card_number        VARCHAR(64) NOT NULL,

    identity_card_url           VARCHAR(512),
    selfie_url                  VARCHAR(512),
    driving_license_url         VARCHAR(512),
    transit_pass_url            VARCHAR(512),
    vehicle_card_url            VARCHAR(512),

    license_expiry_date         DATE,
    insurance_expiry_date       DATE,
    registration_expiry_date    DATE,

    country_id                  UUID REFERENCES countries(id),

    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_user ON drivers(user_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_phone ON drivers(phone_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drivers_account_status ON drivers(account_status);
CREATE INDEX IF NOT EXISTS idx_drivers_operational_status ON drivers(operational_status) WHERE operational_status = 'online';
CREATE INDEX IF NOT EXISTS idx_drivers_location ON drivers(current_location_latitude, current_location_longitude);
CREATE INDEX IF NOT EXISTS idx_drivers_vehicle_type ON drivers(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_drivers_deleted_at ON drivers(deleted_at) WHERE deleted_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 2) driver_documents - one-to-many document records (matches migration 001)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_documents (
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

CREATE INDEX IF NOT EXISTS idx_driver_documents_driver ON driver_documents(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_documents_type ON driver_documents(driver_id, document_type);

-- ----------------------------------------------------------------------------
-- 3) driver_vehicles - one-to-many vehicle records (NEW in migration 022)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_vehicles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id                   UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
    vehicle_type                VARCHAR(64) NOT NULL,
    brand                       VARCHAR(128),
    model                       VARCHAR(128),
    model_year                  INTEGER,
    color                       VARCHAR(32),
    license_plate               VARCHAR(20) NOT NULL,
    chassis_number              VARCHAR(64),
    vehicle_identification_number VARCHAR(64) NOT NULL,
    is_primary                  BOOLEAN NOT NULL DEFAULT FALSE,
    active                      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at                  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_driver_vehicles_driver ON driver_vehicles(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_vehicles_primary ON driver_vehicles(driver_id, active) WHERE is_primary = TRUE;

-- ============================================================================
-- END OF MIGRATION 022
-- ============================================================================