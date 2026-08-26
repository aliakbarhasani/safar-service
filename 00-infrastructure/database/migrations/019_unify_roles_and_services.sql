-- ============================================================================
-- SAFAR SERVICE - UNIFY ROLES & SERVICE TYPES DICTIONARY (PostgreSQL Migration 019)
-- ============================================================================
-- PURPOSE:
--   Establish a single, consistent vocabulary for `user_role` and `service_type`
--   across the whole architecture, aligning the live database with the central
--   constants in `01-core-system/constants/{Roles,ServiceTypes}.js`.
--
--   1) Add the `courier` role to the `user_role` enum (idempotent).
--   2) Extend the `service_type` enum with the newly-unified values
--      (courier, tourism, cross_border) so the dictionary is complete.
--   3) Re-align legacy/seed pricing data: `cargo_light` was never part of the
--      unified dictionary -> remap to `freight`.
--
-- All enum mutations are guarded with idempotent DO blocks (safe to re-run).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) USER ROLES: add `courier`
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'courier'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'courier';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) SERVICE TYPES: complete the enum with the unified dictionary values
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'service_type' AND e.enumlabel = 'courier'
    ) THEN
        ALTER TYPE service_type ADD VALUE 'courier';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'service_type' AND e.enumlabel = 'tourism'
    ) THEN
        ALTER TYPE service_type ADD VALUE 'tourism';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'service_type' AND e.enumlabel = 'cross_border'
    ) THEN
        ALTER TYPE service_type ADD VALUE 'cross_border';
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) PRICING SEED DATA: realign `cargo_light` -> `freight`
--    (legacy value was not part of the unified dictionary)
-- ----------------------------------------------------------------------------
UPDATE pricing_configs
SET service_type = 'freight', updated_at = NOW()
WHERE service_type = 'cargo_light';

-- ============================================================================
-- END OF MIGRATION 019
-- ============================================================================