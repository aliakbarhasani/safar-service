-- ============================================================================
-- Safar Service - pricing schema compatibility repair (Migration 035)
-- ============================================================================
-- Migration 014 created legacy NOT NULL pricing_audit_logs columns. Migration
-- 015 added the modern rule_snapshot/calculation_steps columns but deliberately
-- preserved existing data and did not remove the old constraints. The current
-- quote writer uses the modern audit contract, so legacy-only fields must be
-- nullable for new audit rows. Existing historical values are not changed or
-- deleted. The quotes.final_amount compatibility column is populated by the
-- repository and therefore remains required.
-- ============================================================================
ALTER TABLE pricing_audit_logs
    ALTER COLUMN service_type DROP NOT NULL,
    ALTER COLUMN base_fare DROP NOT NULL,
    ALTER COLUMN per_km_rate DROP NOT NULL,
    ALTER COLUMN per_minute_rate DROP NOT NULL,
    ALTER COLUMN traffic_multiplier_min DROP NOT NULL,
    ALTER COLUMN traffic_multiplier_max DROP NOT NULL,
    ALTER COLUMN night_multiplier DROP NOT NULL,
    ALTER COLUMN commission_rate DROP NOT NULL,
    ALTER COLUMN applied_traffic_factor DROP NOT NULL,
    ALTER COLUMN applied_time_factor DROP NOT NULL,
    ALTER COLUMN gross_amount DROP NOT NULL,
    ALTER COLUMN final_amount DROP NOT NULL;
