-- 033: Make promo usage recording idempotent by completed trip.
-- Fail closed if historical duplicate trip usage rows need manual reconciliation.
CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_usages_trip_id_unique
    ON promo_usages (trip_id)
    WHERE trip_id IS NOT NULL;
