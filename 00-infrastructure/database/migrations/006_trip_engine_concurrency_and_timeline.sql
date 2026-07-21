-- ============================================================================
-- SAFAR SERVICE - TRIP ENGINE CONCURRENCY & TIMELINE
-- PostgreSQL Migration 006
-- ============================================================================
-- This migration adds:
--   • version column for Optimistic Concurrency Control on trips
--   • Guaranteed deleted_at column for strict Soft Delete
--   • trip_timeline table for auditing all state transitions
-- ============================================================================

-- ============================================================================
-- 1. VERSION COLUMN FOR OPTIMISTIC CONCURRENCY CONTROL
-- ============================================================================

ALTER TABLE trips
    ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Verify deleted_at exists (should from migration 001, but guarantee it)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trips' AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE trips ADD COLUMN deleted_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trips_version ON trips(id, version);

-- ============================================================================
-- 2. TRIP TIMELINE TABLE - Auditing State Changes
-- ============================================================================
CREATE TABLE IF NOT EXISTS trip_timeline (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id             UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    previous_status     VARCHAR(32),                          -- Status before transition
    new_status          VARCHAR(32) NOT NULL,                  -- Status after transition
    changed_by          UUID REFERENCES users(id),             -- Who performed the change
    changed_by_role     VARCHAR(32),                           -- Role at time of change (passenger, driver, admin, system)
    reason              TEXT,                                  -- Reason for change (cancellation reason, etc.)
    latitude            NUMERIC(10, 8),                        -- Location at time of change
    longitude           NUMERIC(11, 8),                        -- Location at time of change
    metadata            JSONB DEFAULT '{}',                    -- Additional context
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for timeline queries
CREATE INDEX IF NOT EXISTS idx_trip_timeline_trip ON trip_timeline(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_timeline_created ON trip_timeline(trip_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_timeline_status ON trip_timeline(new_status);
CREATE INDEX IF NOT EXISTS idx_trip_timeline_changed_by ON trip_timeline(changed_by);

-- ============================================================================
-- 3. Trigger: Auto-record timeline on status change
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_auto_record_trip_timeline()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO trip_timeline (
            trip_id, previous_status, new_status,
            changed_by, changed_by_role, reason,
            created_at
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NULL,  -- changed_by should be set by application
            NULL,  -- changed_by_role should be set by application
            NEW.cancel_reason,
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_record_trip_timeline ON trips;
CREATE TRIGGER trg_auto_record_trip_timeline
    AFTER UPDATE OF status ON trips
    FOR EACH ROW
    EXECUTE FUNCTION fn_auto_record_trip_timeline();

-- ============================================================================
-- END OF MIGRATION 006
-- ============================================================================