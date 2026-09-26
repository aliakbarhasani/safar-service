-- ============================================================================
-- SAFAR SERVICE - PRICING QUOTES & AUDIT SNAPSHOTS
-- PostgreSQL Migration 014
-- ============================================================================
-- Motor pricing needs persistent state. Quotes store the calculated amounts
-- (gross and final) with a lifecycle, and pricing_audit_logs store an immutable
-- "snapshot" of exactly which coefficients were applied at calculation time.
--
-- Monetary columns are NUMERIC (exact), never floating point.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TABLE: quotes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference_id  VARCHAR(100),                       -- idempotency key (client-provided)
  trip_request_id VARCHAR(100),
  service_type  VARCHAR(50)  NOT NULL,
  currency_id   VARCHAR(10)  NOT NULL DEFAULT 'IRT',
  gross_amount  NUMERIC(14,2) NOT NULL,             -- subtotal incl. multipliers (before commission)
  final_amount  NUMERIC(14,2) NOT NULL,             -- final payable amount
  status        VARCHAR(20)  NOT NULL DEFAULT 'CREATED', -- CREATED | CONSUMED | EXPIRED
  expires_at    TIMESTAMPTZ  NOT NULL,
  payload       JSONB        NOT NULL DEFAULT '{}', -- full snapshot of the quote for audit/reconstruction
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT quotes_status_check CHECK (status IN ('CREATED', 'CONSUMED', 'EXPIRED')),
  CONSTRAINT quotes_gross_nonneg CHECK (gross_amount >= 0),
  CONSTRAINT quotes_fin_nonneg CHECK (final_amount >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_reference ON quotes(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);

-- ----------------------------------------------------------------------------
-- TABLE: pricing_audit_logs
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_audit_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id          UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_type      VARCHAR(50) NOT NULL,
  rule_id           VARCHAR(100),
  base_fare         NUMERIC(14,2) NOT NULL,
  per_km_rate       NUMERIC(14,2) NOT NULL,
  per_minute_rate   NUMERIC(14,2) NOT NULL,
  traffic_multiplier_min NUMERIC(10,6) NOT NULL,
  traffic_multiplier_max NUMERIC(10,6) NOT NULL,
  night_multiplier  NUMERIC(10,6) NOT NULL,
  commission_rate   NUMERIC(10,6) NOT NULL,
  applied_traffic_factor NUMERIC(10,6) NOT NULL,
  applied_time_factor    NUMERIC(10,6) NOT NULL,
  gross_amount      NUMERIC(14,2) NOT NULL,
  final_amount      NUMERIC(14,2) NOT NULL,
  snapshot          JSONB NOT NULL DEFAULT '{}',   -- full input+config snapshot
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_quote ON pricing_audit_logs(quote_id);
CREATE INDEX IF NOT EXISTS idx_pricing_audit_created ON pricing_audit_logs(created_at);