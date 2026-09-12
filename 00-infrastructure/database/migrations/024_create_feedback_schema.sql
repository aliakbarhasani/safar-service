/**
 * 024_create_feedback_schema.sql - Feedback Service (P5-2)
 *
 * Ensures the `reviews` table (created by migration 002) has the required
 * shape, adds the fast-lookup indexes on `trip_id` and `reviewee_id`, and
 * adds the driver/consumer trust-score columns to the `users` profile:
 *   users.rating        DECIMAL(3,2)  — moving-average trust score
 *   users.total_reviews INTEGER       — count of received reviews
 *
 * STATUS: idempotent — safe to run repeatedly. Registered in MIGRATION_ORDER.
 */

-- ============================================================================
-- reviews table (idempotent: no-op if migration 002 already created it)
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trip_id         UUID NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    reviewer_id     UUID NOT NULL REFERENCES users(id),      -- who gives the review
    reviewee_id     UUID NOT NULL REFERENCES users(id),      -- who receives the review
    entity_type     VARCHAR(32) NOT NULL DEFAULT 'trip',
    rating          SMALLINT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Indexes for fast lookups (P5-2 requirement)
CREATE INDEX IF NOT EXISTS idx_reviews_trip      ON reviews(trip_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee  ON reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer  ON reviews(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_reviews_rating    ON reviews(reviewee_id, rating);

-- جلوگیری از ثبت نظر تکراری برای یک سفر توسط یک کاربر (Partial Unique)
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_trip_reviewer_reviewee
    ON reviews(trip_id, reviewer_id, reviewee_id)
    WHERE deleted_at IS NULL;

-- ============================================================================
-- Trust-score columns on the users profile (moving-average aggregation)
-- ============================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 2) NOT NULL DEFAULT 5.00 CHECK (rating >= 0 AND rating <= 5);
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_reviews INTEGER NOT NULL DEFAULT 0;

COMMENT ON TABLE reviews IS 'Unified feedback/rating system for completed trips (P5-2)';