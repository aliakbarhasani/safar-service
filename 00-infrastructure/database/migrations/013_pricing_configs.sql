-- ============================================================================
-- SAFAR SERVICE - PRICING ENGINE CONFIGURATIONS
-- PostgreSQL Migration 013
-- ============================================================================
-- Deskript: جدول `pricing_configs` مقادیر کشیچگی و ضریب قیمت‌گذاری را
--           хранирует. این مقادیر توسط Super Admin از طریق API مدیریت
--           تغییر می‌یابد و توسط Use Cases قیمت‌گذاری استفاده می‌شود.
--           کلیه مقادیر numeric حاوی اعتبارسنجی (CHECK) می‌باشد.
-- ============================================================================

-- Таблиця: pricing_configs
-- ذخیره‌ی تنظیمات pricing Motor ( کرایه پایه، ضریب ترافیک و ... )
CREATE TABLE IF NOT EXISTS pricing_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             VARCHAR(100) NOT NULL UNIQUE,
  description      TEXT,
  service_type     VARCHAR(50)  NOT NULL,   -- 'taxi', 'cargo', 'delivery', 'urban', 'intercity', ...
  base_fare        DECIMAL(12,2) NOT NULL DEFAULT 0,   -- کرایه پایه (مبلغ ارزی)
  price_per_km     DECIMAL(10,2) NOT NULL DEFAULT 0,   -- قیمت هر کیلومتر
  price_per_min    DECIMAL(10,2) NOT NULL DEFAULT 0,   -- قیمت هر دقیقه (برای تمیـــزان)
  traffic_multiplier_min DECIMAL(5,2) NOT NULL DEFAULT 1.0, -- ضریب ترافیک ساعتMinimum (base=1.0)
  traffic_multiplier_max DECIMAL(5,2) NOT NULL DEFAULT 2.5, -- ضریب ترافیک ساعتMaximum
  night_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.5, -- ضریب شب (از ساعت 00:00 تا 05:00)
  commission_rate  DECIMAL(5,2) NOT NULL DEFAULT 0,   -- کمیسیون سرویس中央 (درصد، مثلا 10 => 10%)
  min_fare         DECIMAL(12,2) NOT NULL DEFAULT 0,   -- حداقل مبلغ achievable
  max_fare         DECIMAL(12,2) NOT NULL DEFAULT 0,   -- حداکثر مبلغ achievable
  status           VARCHAR(20)  NOT NULL DEFAULT 'active', -- 'active' | 'inactive' | 'archived'
  is_default       BOOLEAN      NOT NULL DEFAULT FALSE, -- آیا این تنظیمات پیش‌فرض است؟
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  --.constraints
  CHECK (base_fare >= 0),
  CHECK (price_per_km >= 0),
  CHECK (price_per_min >= 0),
  CHECK (traffic_multiplier_min > 0),
  CHECK (traffic_multiplier_max > traffic_multiplier_min),
  CHECK (night_multiplier > 0),
  CHECK (commission_rate >= 0 AND commission_rate <= 100),
  CHECK (min_fare >= 0),
  CHECK (max_fare >= min_fare),
  CHECK (status IN ('active', 'inactive', 'archived'))
);

-- Insert configurations for standard service types (iranian market)
-- These are seed data; admins can edit later via API
INSERT INTO pricing_configs (name, description, service_type, base_fare, price_per_km, price_per_min, traffic_multiplier_min, traffic_multiplier_max, night_multiplier, commission_rate, min_fare, max_fare, status, is_default)
VALUES
  ('Taxi Urban', 'قیمت پایه taxayte در شهری', 'urban_taxi', 15000, 5000, 2000, 1.0, 2.5, 1.5, 10, 10000, 50000, 'active', TRUE),
  ('Taxi Intercity', 'قیمت taxayte بین‌شهری', 'intercity_taxi', 30000, 8000, 3000, 1.0, 2.0, 2.0, 15, 15000, 100000, 'active', FALSE),
  ('Cargo Light', 'قیمت حمل بار سبک', 'cargo_light', 5000, 2000, 1000, 1.0, 3.0, 1.5, 5, 5000, 30000, 'active', FALSE),
  ('Delivery', 'قیمت ارسال parcel', 'delivery', 8000, 3000, 1500, 1.0, 2.5, 1.5, 8, 2000, 50000, 'active', FALSE)
ON CONFLICT (name) DO NOTHING;

-- Indexes برای سرعت جستجو
CREATE INDEX IF NOT EXISTS idx_pricing_configs_service_type ON pricing_configs(service_type);
CREATE INDEX IF NOT EXISTS idx_pricing_configs_default ON pricing_configs(is_default, status);
CREATE INDEX IF NOT EXISTS idx_pricing_configs_status ON pricing_configs(status);