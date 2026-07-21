-- ============================================================================
-- SAFAR SERVICE - EXTENDED GLOBAL SCHEMA
-- PostgreSQL Migration 002
-- ============================================================================
-- This migration extends the database with:
--   • RBAC (Role-Based Access Control): roles, permissions, role_permissions, user_roles
--   • addresses: Multi-country user addresses
--   • files: Centralized file management
--   • notifications: Notification system
--   • reviews: Unified rating system
--   • coupons: Discount coupon system (Multi-Country, Multi-Currency)
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

CREATE TYPE notification_type AS ENUM (
    'trip_update',
    'promotion',
    'system_alert',
    'security_alert',
    'payment_reminder',
    'driver_message'
);

CREATE TYPE coupon_discount_type AS ENUM ('percentage', 'fixed_amount');

CREATE TYPE review_entity_type AS ENUM ('trip', 'driver', 'passenger');

-- ============================================================================
-- TABLE: roles
-- RBAC: Defines roles in the system (admin, super_admin, support, etc.)
-- ============================================================================
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(64) NOT NULL UNIQUE,           -- e.g. 'super_admin', 'admin', 'support', 'driver', 'passenger'
    display_name    VARCHAR(128) NOT NULL,
    description     TEXT,
    is_system       BOOLEAN NOT NULL DEFAULT FALSE,        -- System roles cannot be deleted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_roles_name ON roles(name);
CREATE INDEX idx_roles_deleted_at ON roles(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: permissions
-- RBAC: Defines granular permissions mapped to modules
-- ============================================================================
CREATE TABLE permissions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(128) NOT NULL UNIQUE,          -- e.g. 'users.create', 'trips.read', 'drivers.update_status'
    module          VARCHAR(64) NOT NULL,                   -- e.g. 'users', 'trips', 'drivers', 'wallets'
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_permissions_module ON permissions(module);

-- ============================================================================
-- TABLE: role_permissions
-- RBAC: Many-to-many relationship between roles and permissions
-- ============================================================================
CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_permission ON role_permissions(permission_id);

-- ============================================================================
-- TABLE: user_roles
-- RBAC: Many-to-many relationship between users and roles
-- ============================================================================
CREATE TABLE user_roles (
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON user_roles(role_id);

-- ============================================================================
-- TABLE: addresses
-- Multi-country address storage for users
-- ============================================================================
CREATE TABLE addresses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(128) NOT NULL,                  -- e.g. 'Home', 'Work', 'Office'
    country_id      UUID REFERENCES countries(id),
    city            VARCHAR(128) NOT NULL,
    district        VARCHAR(128),
    street          VARCHAR(256),
    building        VARCHAR(64),
    unit            VARCHAR(32),
    full_address    TEXT NOT NULL,
    latitude        DECIMAL(10, 7),
    longitude       DECIMAL(10, 7),
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_addresses_user ON addresses(user_id);
CREATE INDEX idx_addresses_country ON addresses(country_id);
CREATE INDEX idx_addresses_default ON addresses(user_id) WHERE is_default = TRUE;
CREATE INDEX idx_addresses_deleted_at ON addresses(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: files
-- Centralized file management for all uploaded documents
-- ============================================================================
CREATE TABLE files (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url             VARCHAR(512) NOT NULL,
    original_name   VARCHAR(256) NOT NULL,
    mime_type       VARCHAR(64) NOT NULL,
    size_bytes      BIGINT NOT NULL DEFAULT 0,
    module          VARCHAR(64) NOT NULL,                   -- e.g. 'drivers', 'users', 'support'
    entity_type     VARCHAR(64),                            -- e.g. 'driver_document', 'avatar', 'ticket_attachment'
    entity_id       UUID,                                   -- ID of the related entity
    uploaded_by     UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_files_module ON files(module);
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);
CREATE INDEX idx_files_uploader ON files(uploaded_by);
CREATE INDEX idx_files_deleted_at ON files(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: notifications
-- Notification system for users
-- ============================================================================
CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title           VARCHAR(256) NOT NULL,
    body            TEXT NOT NULL,
    type            notification_type NOT NULL DEFAULT 'system_alert',
    reference_type  VARCHAR(64),                            -- e.g. 'trip', 'wallet', 'promotion'
    reference_id    UUID,
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    read_at         TIMESTAMPTZ,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_sent ON notifications(sent_at DESC);
CREATE INDEX idx_notifications_deleted_at ON notifications(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: reviews
-- Unified rating system for trips, drivers, and passengers
-- ============================================================================
CREATE TABLE reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES users(id),     -- Who gave the review
    reviewee_id     UUID NOT NULL REFERENCES users(id),    -- Who received the review
    entity_type     review_entity_type NOT NULL DEFAULT 'trip',
    rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT unique_review_per_trip UNIQUE (trip_id, reviewer_id, reviewee_id)
);

CREATE INDEX idx_reviews_trip ON reviews(trip_id);
CREATE INDEX idx_reviews_reviewer ON reviews(reviewer_id);
CREATE INDEX idx_reviews_reviewee ON reviews(reviewee_id);
CREATE INDEX idx_reviews_rating ON reviews(reviewee_id, rating);
CREATE INDEX idx_reviews_deleted_at ON reviews(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: coupons
-- Discount coupon system with Multi-Country & Multi-Currency support
-- ============================================================================
CREATE TABLE coupons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(32) NOT NULL,
    description         TEXT,
    discount_type       coupon_discount_type NOT NULL,
    discount_value      BIGINT NOT NULL CHECK (discount_value > 0),  -- Percentage (1-100) or fixed amount
    max_discount_amount BIGINT,                                      -- Maximum discount cap (for percentage type)
    min_trip_cost       BIGINT NOT NULL DEFAULT 0,                   -- Minimum trip cost to apply
    max_usage_count     INTEGER NOT NULL DEFAULT 1,                  -- Maximum times this coupon can be used
    current_usage_count INTEGER NOT NULL DEFAULT 0,
    max_usage_per_user  INTEGER NOT NULL DEFAULT 1,
    country_id          UUID REFERENCES countries(id),               -- Multi-Country support (NULL = all countries)
    currency_id         UUID REFERENCES currencies(id),              -- Multi-Currency support
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    starts_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at          TIMESTAMPTZ,
    created_by          UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_coupons_code ON coupons(code) WHERE deleted_at IS NULL;
CREATE INDEX idx_coupons_country ON coupons(country_id);
CREATE INDEX idx_coupons_currency ON coupons(currency_id);
CREATE INDEX idx_coupons_active ON coupons(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_coupons_dates ON coupons(starts_at, expires_at);
CREATE INDEX idx_coupons_deleted_at ON coupons(deleted_at) WHERE deleted_at IS NOT NULL;

-- ============================================================================
-- TABLE: user_coupons
-- Tracks coupon usage per user
-- ============================================================================
CREATE TABLE user_coupons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coupon_id       UUID NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
    trip_id         UUID REFERENCES trips(id),
    used_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_coupon_usage UNIQUE (user_id, coupon_id, trip_id)
);

CREATE INDEX idx_user_coupons_user ON user_coupons(user_id);
CREATE INDEX idx_user_coupons_coupon ON user_coupons(coupon_id);

-- ============================================================================
-- DEFAULT DATA: RBAC
-- ============================================================================

-- Insert default roles
INSERT INTO roles (name, display_name, description, is_system) VALUES
    ('super_admin', 'Super Admin', 'Full system access with all permissions', TRUE),
    ('admin', 'Administrator', 'Administrative access to manage system', TRUE),
    ('support', 'Support Agent', 'Customer support access', TRUE),
    ('driver', 'Driver', 'Service provider - can accept trips', TRUE),
    ('passenger', 'Passenger', 'End user - can request trips', TRUE);

-- Insert default permissions
INSERT INTO permissions (name, module, description) VALUES
    -- User management
    ('users.create', 'users', 'Create new users'),
    ('users.read', 'users', 'View user information'),
    ('users.update', 'users', 'Update user information'),
    ('users.delete', 'users', 'Delete users'),
    ('users.assign_role', 'users', 'Assign roles to users'),

    -- Driver management
    ('drivers.create', 'drivers', 'Register new drivers'),
    ('drivers.read', 'drivers', 'View driver information'),
    ('drivers.update', 'drivers', 'Update driver information'),
    ('drivers.update_status', 'drivers', 'Change driver account status'),

    -- Trip management
    ('trips.create', 'trips', 'Create trips'),
    ('trips.read', 'trips', 'View trip information'),
    ('trips.update', 'trips', 'Update trip status'),
    ('trips.cancel', 'trips', 'Cancel trips'),

    -- Wallet management
    ('wallets.read', 'wallets', 'View wallet balance'),
    ('wallets.charge', 'wallets', 'Charge wallets'),
    ('wallets.deduct', 'wallets', 'Deduct from wallets'),

    -- System configuration
    ('config.read', 'system', 'View system configurations'),
    ('config.update', 'system', 'Update system configurations'),

    -- Coupon management
    ('coupons.create', 'coupons', 'Create discount coupons'),
    ('coupons.read', 'coupons', 'View coupon information'),
    ('coupons.update', 'coupons', 'Update coupons'),
    ('coupons.delete', 'coupons', 'Delete coupons'),

    -- Review management
    ('reviews.create', 'reviews', 'Submit reviews'),
    ('reviews.read', 'reviews', 'View reviews'),

    -- RBAC management
    ('roles.create', 'rbac', 'Create roles'),
    ('roles.read', 'rbac', 'View roles'),
    ('roles.update', 'rbac', 'Update roles'),
    ('roles.delete', 'rbac', 'Delete roles'),
    ('permissions.assign', 'rbac', 'Assign permissions to roles');

-- Assign all permissions to super_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'super_admin'), id FROM permissions;

-- Assign specific permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'admin'), id FROM permissions
WHERE module IN ('users', 'drivers', 'trips', 'wallets', 'config', 'coupons', 'reviews');

-- Assign specific permissions to support role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'support'), id FROM permissions
WHERE name IN ('users.read', 'drivers.read', 'trips.read', 'reviews.read', 'reviews.create');

-- Assign specific permissions to driver role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'driver'), id FROM permissions
WHERE name IN ('trips.read', 'trips.update', 'wallets.read', 'drivers.read');

-- Assign specific permissions to passenger role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'passenger'), id FROM permissions
WHERE name IN ('trips.create', 'trips.read', 'trips.cancel', 'wallets.read', 'reviews.create', 'reviews.read');

-- ============================================================================
-- END OF MIGRATION 002
-- ============================================================================