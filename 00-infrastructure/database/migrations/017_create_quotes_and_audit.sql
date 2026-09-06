-- Migration: Quotes and Pricing Audit Logs
CREATE TABLE IF NOT EXISTS quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_id VARCHAR(100),
    pricing_config_id UUID NOT NULL,
    service_type VARCHAR(50) NOT NULL,
    currency_code VARCHAR(3) NOT NULL DEFAULT 'IRT',
    currency_precision INTEGER NOT NULL DEFAULT 0,
    rounding_mode VARCHAR(30) NOT NULL DEFAULT 'HALF_EVEN',
    gross_amount NUMERIC(19, 4) NOT NULL,
    discount_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    tax_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    commission_amount NUMERIC(19, 4) NOT NULL DEFAULT 0.0000,
    provider_amount NUMERIC(19, 4) NOT NULL,
    customer_final_amount NUMERIC(19, 4) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'CREATED',
    input_snapshot JSONB NOT NULL,
    calculation_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,

    CONSTRAINT chk_quotes_status CHECK (status IN ('CREATED', 'ACTIVE', 'EXPIRED', 'CONSUMED', 'CANCELLED')),
    CONSTRAINT chk_quotes_expires_at CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_reference ON quotes(reference_id) WHERE reference_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_expires ON quotes(expires_at);

CREATE TABLE IF NOT EXISTS pricing_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
    action_type VARCHAR(50) NOT NULL,
    rule_snapshot JSONB NOT NULL,
    calculation_steps JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_audit_quote ON pricing_audit_logs(quote_id);