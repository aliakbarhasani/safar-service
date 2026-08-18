-- ============================================================================
-- SAFAR SERVICE - PRICING QUOTES & AUDIT LOGS (FINAL SCHEMA)
-- PostgreSQL Migration 015
-- ============================================================================
-- Repair migration: the `quotes` / `pricing_audit_logs` tables (created by the
-- older 014_pricing_quotes_audit.sql) did not match the final architecture
-- (Decimal money columns, pricing_config_id reference, idempotency scope,
-- CHECK constraints for status/expires_at, immutable audit snapshot).
--
-- Because `CREATE TABLE IF NOT EXISTS` would silently keep the old columns,
-- we rebuild these two tables to the exact final schema here.
-- ============================================================================

DROP TABLE IF EXISTS pricing_audit_logs;
DROP TABLE IF EXISTS quotes;

-- ----------------------------------------------------------------------------
-- TABLE: quotes
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotes (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id          VARCHAR(100),
    pricing_config_id     UUID NOT NULL,
    service_type          VARCHAR(50)  NOT NULL,
    currency_code         VARCHAR(3)   NOT NULL DEFAULT 'IRT',
    currency_precision    INTEGER      NOT NULL DEFAULT 0,
    rounding_mode         VARCHAR(30)  NOT NULL DEFAULT 'HALF_EVEN',
    gross_amount          NUMERIC(19, 4) NOT NULL,
    discount_amount       NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    tax_amount            NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    commission_amount     NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    provider_amount       NUMERIC(19, 4) NOT NULL,
    customer_final_amount NUMERIC(19, 4) NOT NULL,
    status                VARCHAR(20)  NOT NULL DEFAULT 'CREATED',
    input_snapshot        JSONB        NOT NULL,
    calculation_snapshot  JSONB        NOT NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at            TIMESTAMPTZ  NOT NULL,
    consumed_at           TIMESTAMPTZ,
    cancelled_at          TIMESTAMPTZ,

    CONSTRAINT chk_quotes_status     CHECK (status IN ('CREATED', 'ACTIVE', 'EXPIRED', 'CONSUMED', 'CANCELLED')),
    CONSTRAINT chk_quotes_expires_at CHECK (expires_at > created_at),
    CONSTRAINT chk_quotes_nonneg     CHECK (gross_amount >= 0 AND customer_final_amount >= 0 AND provider_amount >= 0)
);

-- Idempotency scope: unique reference_id only when present (nullable)
CREATE UNIQUE INDEX idx_quotes_reference
    ON quotes(reference_id)
    WHERE reference_id IS NOT NULL;

CREATE INDEX idx_quotes_status  ON quotes(status);
CREATE INDEX idx_quotes_expires ON quotes(expires_at);

-- ----------------------------------------------------------------------------
-- TABLE: pricing_audit_logs (immutable per-calculation snapshot)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pricing_audit_logs (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id             UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    action_type          VARCHAR(50) NOT NULL,
    rule_snapshot        JSONB       NOT NULL,
    calculation_steps    JSONB       NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_audit_action CHECK (action_type IN ('QUOTE_GENERATED', 'QUOTE_CONSUMED', 'QUOTE_EXPIRED', 'QUOTE_CANCELLED'))
);

CREATE INDEX idx_pricing_audit_quote     ON pricing_audit_logs(quote_id);
CREATE INDEX idx_pricing_audit_created   ON pricing_audit_logs(created_at);