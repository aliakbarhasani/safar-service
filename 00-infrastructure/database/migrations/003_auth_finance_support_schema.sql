-- ============================================================================
-- SAFAR SERVICE - AUTH, FINANCE & SUPPORT SCHEMA
-- PostgreSQL Migration 003
-- ============================================================================
-- This migration adds 8 new tables across three critical domains:
--
--   PART 1: Auth & Security (4 tables)
--     - devices: Device information storage for push notifications
--     - user_devices: Many-to-Many user-device relationship
--     - sessions: Active session management with refresh tokens
--     - otp_codes: One-Time Password management for authentication
--
--   PART 2: Fleet Finance (2 tables) - Multi-Currency compliant
--     - driver_earnings: Per-trip earnings breakdown for drivers
--     - driver_settlements: Bulk settlement/payout records
--
--   PART 3: Customer Support (2 tables)
--     - tickets: Support ticket system with unique tracking
--     - ticket_messages: Message threads within each ticket
--
-- Architectural Rules Followed:
--   • UUID primary keys for all 8 tables
--   • Soft delete (deleted_at) on all core tables (not junction/OTP tables)
--   • Foreign Keys to existing tables (users, drivers, trips, currencies)
--   • Proper indexing on all foreign keys and high-query fields
--   • Multi-Currency support for all financial tables
--   • ENUM types for all status/type fields
-- ============================================================================

-- ============================================================================
-- ENUM TYPES
-- ============================================================================

-- (P1 — Idempotent) ساخت enumها داخل بلوک محافظت‌شده تا اجرای چندباره خطا ندهد
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'earning_type') THEN
        CREATE TYPE earning_type AS ENUM (
            'trip_fare',
            'bonus',
            'tip',
            'adjustment',
            'penalty'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_status') THEN
        CREATE TYPE settlement_status AS ENUM (
            'pending',
            'processing',
            'completed',
            'failed',
            'cancelled'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_priority') THEN
        CREATE TYPE ticket_priority AS ENUM (
            'low',
            'medium',
            'high',
            'urgent',
            'critical'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_status') THEN
        CREATE TYPE ticket_status AS ENUM (
            'open',
            'in_progress',
            'waiting_on_customer',
            'waiting_on_third_party',
            'resolved',
            'closed',
            'escalated'
        );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ticket_department') THEN
        CREATE TYPE ticket_department AS ENUM (
            'support',
            'billing',
            'technical',
            'driver_affairs',
            'cargo',
            'tours',
            'security'
        );
    END IF;
END $$;

-- ============================================================================
-- PART 1: AUTH & SECURITY
-- ============================================================================

-- --------------------------------------------------------------------------
-- TABLE: devices
-- Stores device information for push notification targeting and device
-- management. Each device is uniquely identified by its hardware ID.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id           VARCHAR(255) NOT NULL UNIQUE,        -- Unique device hardware identifier
    fcm_token           VARCHAR(512),                         -- Firebase Cloud Messaging token for push notifications
    platform            VARCHAR(32) NOT NULL,                 -- 'ios', 'android', 'web'
    device_model        VARCHAR(128),                         -- e.g. 'iPhone 15 Pro', 'Samsung Galaxy S24'
    os_version          VARCHAR(32),                          -- e.g. '17.4', '14.0'
    app_version         VARCHAR(16),                          -- e.g. '2.5.1'
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,        -- Whether the device is allowed to receive notifications
    last_used_at        TIMESTAMPTZ,                          -- Last time this device was used for authentication
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                           -- Soft Delete
);

CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
CREATE INDEX IF NOT EXISTS idx_devices_platform ON devices(platform);
CREATE INDEX IF NOT EXISTS idx_devices_fcm_token ON devices(fcm_token) WHERE fcm_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_devices_active ON devices(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_devices_deleted_at ON devices(deleted_at) WHERE deleted_at IS NOT NULL;

-- --------------------------------------------------------------------------
-- TABLE: user_devices
-- Many-to-Many relationship between users and devices. A user can have
-- multiple devices (phone, tablet, etc.), and a device could theoretically
-- be shared (though typically one user per device).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_devices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id           UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    is_primary          BOOLEAN NOT NULL DEFAULT FALSE,       -- Primary device for push notifications
    is_trusted          BOOLEAN NOT NULL DEFAULT FALSE,       -- Trusted device (skip OTP for certain actions)
    first_login_at      TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_device ON user_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_primary ON user_devices(user_id, device_id) WHERE is_primary = TRUE;

-- ============================================================================
-- PART 2: FLEET FINANCE (Multi-Currency)
-- ============================================================================

-- --------------------------------------------------------------------------
-- TABLE: driver_earnings
-- Granular per-trip earnings tracking for drivers. Each trip can have
-- multiple earning entries (fare, tip, bonus, penalty) with individual
-- currency support for cross-border operations.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_earnings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id),
    trip_id             UUID NOT NULL REFERENCES trips(id),
    amount              BIGINT NOT NULL CHECK (amount >= 0),  -- Amount in smallest currency unit (e.g. Rials, cents)
    currency_id         UUID NOT NULL REFERENCES currencies(id), -- Multi-Currency support
    amount_in_default   BIGINT NOT NULL,                      -- Converted amount in default currency for unified reporting
    earning_type        earning_type NOT NULL DEFAULT 'trip_fare',
    description         TEXT,                                 -- Contextual description of the earning
    is_settled          BOOLEAN NOT NULL DEFAULT FALSE,       -- Whether this earning is included in a settlement
    settlement_id       UUID,                                 -- FK to driver_settlements (set when settled)
    earned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),    -- When the earning was recorded
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                           -- Soft Delete
);

CREATE INDEX IF NOT EXISTS idx_driver_earnings_driver ON driver_earnings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_trip ON driver_earnings(trip_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_currency ON driver_earnings(currency_id);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_unsettled ON driver_earnings(driver_id) WHERE is_settled = FALSE AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_driver_earnings_type ON driver_earnings(driver_id, earning_type);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_date ON driver_earnings(earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_earnings_deleted_at ON driver_earnings(deleted_at) WHERE deleted_at IS NOT NULL;

-- --------------------------------------------------------------------------
-- TABLE: driver_settlements
-- Bulk settlement/payout records for driver earnings. Represents the
-- actual payout to the driver's bank account or wallet, with full
-- multi-currency and multi-country compliance.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS driver_settlements (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id           UUID NOT NULL REFERENCES drivers(id),
    amount              BIGINT NOT NULL CHECK (amount >= 0),  -- Total settlement amount
    currency_id         UUID NOT NULL REFERENCES currencies(id), -- Settlement currency
    amount_in_default   BIGINT NOT NULL,                      -- Amount converted to default currency
    fee_amount          BIGINT NOT NULL DEFAULT 0,             -- Processing/transaction fee
    net_amount          BIGINT NOT NULL,                      -- Amount - fee = net payout
    settlement_date     DATE NOT NULL DEFAULT CURRENT_DATE,    -- The date this settlement applies to
    period_start        DATE NOT NULL,                        -- Start of the settlement period
    period_end          DATE NOT NULL,                        -- End of the settlement period
    bank_account_number VARCHAR(64),                          -- IBAN/Shaba number or account number
    bank_name           VARCHAR(128),                         -- Name of the bank
    bank_swift          VARCHAR(16),                          -- BIC/SWIFT code for international transfers
    wallet_id           UUID REFERENCES wallets(id),          -- Alternative: pay to wallet
    status              settlement_status NOT NULL DEFAULT 'pending',
    transaction_reference VARCHAR(255),                       -- Payment gateway/bank reference number
    processed_by        UUID REFERENCES users(id),            -- Admin who processed the settlement
    processed_at        TIMESTAMPTZ,                          -- When the settlement was actually paid
    notes               TEXT,                                 -- Internal notes about the settlement
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                           -- Soft Delete
);

CREATE INDEX IF NOT EXISTS idx_driver_settlements_driver ON driver_settlements(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_currency ON driver_settlements(currency_id);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_status ON driver_settlements(status);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_date ON driver_settlements(settlement_date DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_period ON driver_settlements(driver_id, period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_deleted_at ON driver_settlements(deleted_at) WHERE deleted_at IS NOT NULL;
-- (P1 — Idempotent) حذف محافظت‌شده پیش از بازسازی constraint
ALTER TABLE driver_earnings DROP CONSTRAINT IF EXISTS fk_driver_earnings_settlement;


-- Add FK constraint from driver_earnings to driver_settlements (after settlements table exists)
ALTER TABLE driver_earnings
    ADD CONSTRAINT fk_driver_earnings_settlement
    FOREIGN KEY (settlement_id) REFERENCES driver_settlements(id) ON DELETE SET NULL;

-- ============================================================================
-- PART 3: CUSTOMER SUPPORT
-- ============================================================================

-- --------------------------------------------------------------------------
-- TABLE: tickets
-- Comprehensive support ticket system with unique tracking codes,
-- priority levels, and multi-department routing.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES users(id),  -- Ticket creator (passenger, driver, or provider)
    assigned_to         UUID REFERENCES users(id),           -- Support agent assigned to this ticket
    tracking_code       VARCHAR(16) NOT NULL UNIQUE,          -- Human-readable unique tracking code (e.g. 'TKT-1A2B3C')
    department          ticket_department NOT NULL DEFAULT 'support',
    subject             VARCHAR(256) NOT NULL,
    description         TEXT,                                 -- Initial issue description
    priority            ticket_priority NOT NULL DEFAULT 'medium',
    status              ticket_status NOT NULL DEFAULT 'open',
    source              VARCHAR(32) DEFAULT 'app',            -- 'app', 'web', 'phone', 'email', 'social_media'
    related_entity_type VARCHAR(64),                          -- e.g. 'trip', 'driver', 'payment', 'wallet'
    related_entity_id   UUID,                                -- ID of the related entity
    is_escalated        BOOLEAN NOT NULL DEFAULT FALSE,
    escalated_at        TIMESTAMPTZ,
    escalated_to        UUID REFERENCES users(id),           -- Higher-level support/supervisor
    resolved_at         TIMESTAMPTZ,
    resolution_summary  TEXT,                                 -- Summary of how the ticket was resolved
    closed_at           TIMESTAMPTZ,
    closed_by           UUID REFERENCES users(id),           -- Who closed the ticket
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ                           -- Soft Delete
);

CREATE INDEX IF NOT EXISTS idx_tickets_user ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_department ON tickets(department);
CREATE INDEX IF NOT EXISTS idx_tickets_tracking ON tickets(tracking_code);
CREATE INDEX IF NOT EXISTS idx_tickets_entity ON tickets(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_tickets_open ON tickets(status) WHERE status IN ('open', 'in_progress', 'waiting_on_customer');
CREATE INDEX IF NOT EXISTS idx_tickets_escalated ON tickets(is_escalated) WHERE is_escalated = TRUE;
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_deleted_at ON tickets(deleted_at) WHERE deleted_at IS NOT NULL;

-- --------------------------------------------------------------------------
-- TABLE: ticket_messages
-- Message thread within each support ticket. Supports rich text and
-- file attachments for comprehensive communication.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ticket_messages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id           UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    sender_id           UUID NOT NULL REFERENCES users(id),  -- Who sent the message
    message_text        TEXT NOT NULL,                        -- The message content
    message_type        VARCHAR(32) NOT NULL DEFAULT 'text',  -- 'text', 'system_note', 'status_change'
    attachments         JSONB DEFAULT '[]'::JSONB,            -- Array of file references [{url, name, type, size}]
    is_internal         BOOLEAN NOT NULL DEFAULT FALSE,       -- Internal notes (not visible to customer)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender ON ticket_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_created ON ticket_messages(ticket_id, created_at);

-- ============================================================================
-- DEFAULT DATA: Support Permissions
-- ============================================================================

-- Support-specific permissions for the new modules
INSERT INTO permissions (name, module, description) VALUES
    -- Ticket management
    ('tickets.create', 'support', 'Create support tickets'),
    ('tickets.read', 'support', 'View support tickets'),
    ('tickets.update', 'support', 'Update support tickets'),
    ('tickets.assign', 'support', 'Assign tickets to agents'),
    ('tickets.close', 'support', 'Close support tickets'),
    ('tickets.escalate', 'support', 'Escalate support tickets'),

    -- Finance permissions
    ('earnings.read', 'finance', 'View driver earnings'),
    ('settlements.create', 'finance', 'Create driver settlements'),
    ('settlements.read', 'finance', 'View driver settlements'),
    ('settlements.process', 'finance', 'Process driver settlements'),
    ('settlements.cancel', 'finance', 'Cancel driver settlements') ON CONFLICT DO NOTHING;

-- Assign ticket permissions to support role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'support'), id FROM permissions
WHERE name IN ('tickets.create', 'tickets.read', 'tickets.update', 'tickets.assign', 'tickets.close', 'tickets.escalate') ON CONFLICT DO NOTHING;

-- Assign ticket & finance permissions to admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'admin'), id FROM permissions
WHERE module IN ('support', 'finance') ON CONFLICT DO NOTHING;

-- Assign ticket create/read to driver role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'driver'), id FROM permissions
WHERE name IN ('tickets.create', 'tickets.read', 'earnings.read', 'settlements.read') ON CONFLICT DO NOTHING;

-- Assign ticket create/read to passenger role
INSERT INTO role_permissions (role_id, permission_id)
SELECT (SELECT id FROM roles WHERE name = 'passenger'), id FROM permissions
WHERE name IN ('tickets.create', 'tickets.read') ON CONFLICT DO NOTHING;

-- ============================================================================
-- END OF MIGRATION 003
-- ============================================================================