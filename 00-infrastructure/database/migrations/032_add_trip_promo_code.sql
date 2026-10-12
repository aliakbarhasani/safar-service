-- Persist the promo code selected on the server-generated fare quote with the trip.
-- Idempotent: safe to run on databases where the column already exists.
ALTER TABLE trips ADD COLUMN IF NOT EXISTS promo_code VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_trips_promo_code
  ON trips (promo_code)
  WHERE promo_code IS NOT NULL;
