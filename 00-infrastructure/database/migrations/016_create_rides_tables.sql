-- ============================================================================
-- SAFAR SERVICE - RIDE ENGINE TABLES
-- PostgreSQL Migration 016
-- ============================================================================
-- Deskript: جداول موتور مدیریت سفر (Ride Engine) مشابه استاندارد جهانی
--           (Uber / Snapp). شامل جدول اصلی سفر و جدول تاریخچه تغییر وضعیت
--           (State Transition Log).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: rides
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rides (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id  UUID NOT NULL,
  driver_id     UUID,                             -- nullable: هنوز راننده انتخاب نشده
  quote_id      UUID NOT NULL,
  status        VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  origin_lat    NUMERIC(10, 7) NOT NULL,
  origin_lng    NUMERIC(10, 7) NOT NULL,
  dest_lat      NUMERIC(10, 7) NOT NULL,
  dest_lng      NUMERIC(10, 7) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT rides_status_check
    CHECK (status IN ('REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVED',
                      'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),

  -- Foreign keys
  CONSTRAINT fk_rides_passenger
    FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rides_driver
    FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_rides_quote
    FOREIGN KEY (quote_id) REFERENCES quotes(id) ON DELETE RESTRICT
);

-- Indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_rides_passenger ON rides(passenger_id);
CREATE INDEX IF NOT EXISTS idx_rides_driver    ON rides(driver_id);
CREATE INDEX IF NOT EXISTS idx_rides_status    ON rides(status);

-- ----------------------------------------------------------------------------
-- TABLE: ride_status_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ride_status_logs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id             UUID NOT NULL,
  old_status          VARCHAR(20),                -- nullable: اولین وضعیت
  new_status          VARCHAR(20) NOT NULL,
  changed_by_user_id  UUID NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT ride_status_logs_status_check
    CHECK (new_status IN ('REQUESTED', 'SEARCHING', 'ACCEPTED', 'ARRIVED',
                          'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT ride_status_logs_old_status_check
    CHECK (old_status IS NULL OR old_status IN ('REQUESTED', 'SEARCHING', 'ACCEPTED',
                                                'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),

  -- Foreign keys
  CONSTRAINT fk_status_logs_ride
    FOREIGN KEY (ride_id) REFERENCES rides(id) ON DELETE CASCADE,
  CONSTRAINT fk_status_logs_changed_by
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for fast lookup of status history
CREATE INDEX IF NOT EXISTS idx_ride_status_logs_ride  ON ride_status_logs(ride_id);
CREATE INDEX IF NOT EXISTS idx_ride_status_logs_new   ON ride_status_logs(new_status);