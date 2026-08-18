-- ============================================================================
-- SAFAR SERVICE - SELLER & ADVERTISER ROLES
-- PostgreSQL Migration 012
-- ============================================================================
-- The `user_role` enum (used by users.role) did not include the business
-- roles `seller` and `advertiser`. The application code already allows and
-- provisions profiles for these roles (UserRegistered -> sellers/advertisers).
-- This migration adds both values to the enum, guarded with a DO block for
-- idempotency across PostgreSQL versions (incl. < PG12).
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'seller'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'seller';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON e.enumtypid = t.oid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'advertiser'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'advertiser';
    END IF;
END $$;