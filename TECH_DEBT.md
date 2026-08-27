# Technical Debt Register

## Database migrations — 2026-08-27

### Migration 010: RBAC schema mismatch

- **Observed errors:** missing `permissions.slug`, `permissions.module_name`, and
  `role_permissions.role_name`; SQL parser error near `</`.
- **Likely cause:** an earlier `permissions`/`role_permissions` schema already
  exists with incompatible columns, and `010_rbac_tables.sql` contains a stray
  token that the SQL parser rejects near `</`.
- **Required follow-up:** write a forward-only compatibility migration that
  inspects and migrates the existing RBAC tables, then remove the invalid token.

### Migration 015: quote-table rebuild is unsafe with live dependencies

- **Observed error:** `cannot drop table quotes because other objects depend on it`.
- **Likely cause:** migration 015 drops and recreates `quotes` while later or
  already-applied tables hold foreign keys to it.
- **Required follow-up:** replace destructive rebuilds with an additive,
  forward-only schema migration after cataloguing all dependencies.

### Migration 018: legacy pricing cleanup has unresolved dependencies

- **Observed error:** `cannot drop table pricing_rules because other objects depend on it`.
- **Likely cause:** legacy consumers or constraints still reference
  `pricing_rules`.
- **Required follow-up:** identify every dependency, migrate active consumers to
  the consolidated pricing schema, and only then retire the table after backup
  approval.
