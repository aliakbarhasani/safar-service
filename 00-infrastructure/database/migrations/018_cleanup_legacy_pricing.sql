-- ============================================================================
-- SAFAR SERVICE - LEGACY PRICING TABLES CLEANUP (PostgreSQL Migration 018)
-- ============================================================================
-- PURPOSE:
--   The consolidated pricing architecture now persists ONLY to the tables:
--       quotes, pricing_configs, pricing_audit_logs    (migrations 013/015)
--   The legacy V1.0 pricing tables are no longer written by any active path
--   and are kept only for historical reference.
--
--   This migration RETIRES the legacy tables after a verified database backup.
--
-- !! DO NOT APPLY until a backup has been taken and the quotes-based
--    pipeline is confirmed as the single source of truth.               !!
--
-- ============================================================================

DROP TABLE IF EXISTS price_quotes;
DROP TABLE IF EXISTS pricing_rules;

-- ============================================================================
-- END OF MIGRATION 018
-- ============================================================================