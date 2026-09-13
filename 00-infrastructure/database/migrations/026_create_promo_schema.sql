-- 025: Promo codes and usage tracking
-- Idempotent: safe to run multiple times

CREATE TABLE IF NOT EXISTS promo_codes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(64) NOT NULL UNIQUE,
    type                VARCHAR(16) NOT NULL CHECK (type IN ('PERCENTAGE', 'FIXED')),
    value               DECIMAL(12,2) NOT NULL CHECK (value >= 0),
    max_discount_amount DECIMAL(12,2),
    max_uses_per_user   INTEGER NOT NULL DEFAULT 1 CHECK (max_uses_per_user >= 0),
    global_max_uses     INTEGER NOT NULL DEFAULT 0 CHECK (global_max_uses >= 0),
    current_uses        INTEGER NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
    expires_at          TIMESTAMPTZ,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON promo_codes (code);
CREATE INDEX IF NOT EXISTS idx_promo_codes_active ON promo_codes (is_active) WHERE is_active = TRUE;

CREATE TABLE IF NOT EXISTS promo_usages (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL,
    promo_code  VARCHAR(64) NOT NULL,
    used_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trip_id     UUID,
    FOREIGN KEY (promo_code) REFERENCES promo_codes (code)
);

CREATE INDEX IF NOT EXISTS idx_promo_usages_user_code ON promo_usages (user_id, promo_code);
CREATE INDEX IF NOT EXISTS idx_promo_usages_trip ON promo_usages (trip_id);
