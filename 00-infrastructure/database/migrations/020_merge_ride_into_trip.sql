-- ============================================================================
-- SAFAR SERVICE - MERGE RIDE INTO UNIFIED TRIP (PostgreSQL Migration 020)
-- ============================================================================
-- PURPOSE:
--   Phase 1 of Mobility Engine consolidation (16-ride-engine -> 16-mobility-engine).
--   Defines the FINAL (single source of truth) schema for `trips` and
--   `trip_timeline`, merging the ride-engine needs (quote consumption, geolocation)
--   into the existing rich `trips`/`trip_timeline` schema.
--
--   The `rides` and `ride_status_logs` tables (migration 016) remain for now
--   (backwards compatibility); this migration enriches the canonical `trips`
--   tables so that the unified engine can persist to a single schema.
--
-- !! NOT EXECUTED YET - created for the deployment step after a DB backup. !!
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) UNIFIED `trips` - add ride/pricing/geolocation columns (idempotent)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Exact domain lifecycle state (UPPERCASE, e.g. CANCELLED_BY_DRIVER).
    -- The mobility engine writes BOTH this column (source of truth) and the
    -- mirrored lowercase enum in `status`/`trip_phase`.
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='lifecycle_status') THEN
        ALTER TABLE trips ADD COLUMN lifecycle_status VARCHAR(30);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='quote_id') THEN
        ALTER TABLE trips ADD COLUMN quote_id UUID REFERENCES quotes(id) ON DELETE RESTRICT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='origin_lng') THEN
        ALTER TABLE trips ADD COLUMN origin_lng NUMERIC(10,7);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='dest_lat') THEN
        ALTER TABLE trips ADD COLUMN dest_lat NUMERIC(10,7);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='dest_lng') THEN
        ALTER TABLE trips ADD COLUMN dest_lng NUMERIC(10,7);
    END IF;

    -- Commission / pricing columns already added in migration 006/financial-integrity,
    -- but ensure presence here for idempotency on older databases:
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='commission_amount') THEN
        ALTER TABLE trips ADD COLUMN commission_amount NUMERIC(19,4) DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trips' AND column_name='driver_earning') THEN
        ALTER TABLE trips ADD COLUMN driver_earning NUMERIC(19,4) DEFAULT 0;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) UNIFIED `trip_timeline` - ensure ride_status_logs-style columns exist.
--    (old_status/new_status/changed_by already present; add quote context if needed)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='trip_timeline' AND column_name='trip_phase') THEN
        ALTER TABLE trip_timeline ADD COLUMN trip_phase VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='idx_trips_quote') THEN
        CREATE INDEX idx_trips_quote ON trips(quote_id) WHERE quote_id IS NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION 020
-- ============================================================================