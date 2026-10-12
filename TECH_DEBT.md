# Technical Debt Register

## Database migrations — status revalidated 2026-10-12

This register supersedes the historical observations recorded on 2026-08-27.
Those observations explain the original failures, but they must not be treated as
proof that the same defects still exist in the current files.

### Migration 010: RBAC schema compatibility

- **Historical finding:** the earlier migration layout used column names that
  differed from the canonical RBAC schema, and a prior run reported a SQL parser
  error.
- **Current source observation:** `010_rbac_tables.sql` now documents the
  canonical schema and includes guarded compatibility renames for legacy
  columns such as `slug`, `module_name`, and `role_name`.
- **Status:** source-level repair present; database compatibility is not fully
  verified by this file inspection alone.
- **Remaining verification:** test against both a clean database and a database
  created with the legacy 010 layout; verify foreign keys, indexes, constraints,
  permissions data, and repeated execution. Confirm whether the historical
  parser error can still be reproduced.

### Migration 015: quotes and pricing audit schema

- **Historical finding:** the earlier migration dropped and recreated tables
  that could have dependent objects and existing data.
- **Current source observation:** `015_quotes_audit_final.sql` states that the
  destructive DROP approach was removed and uses additive table/column
  creation in the inspected section.
- **Status:** non-destructive direction is present in source; preservation of
  every existing schema/data shape is not yet established.
- **Remaining verification:** test upgrades from each supported prior schema,
  including existing foreign keys, indexes, constraints, duplicate data, and
  incomplete/partially applied migrations. Confirm that constraints can be
  added safely when existing rows violate them.

### Migration 018: legacy pricing retirement

- **Historical finding:** the previous cleanup used `DROP TABLE ... CASCADE`,
  risking loss of legacy tables and dependent objects.
- **Current source observation:** `018_cleanup_legacy_pricing.sql` now renames
  the legacy tables to `legacy_price_quotes_deprecated` and
  `legacy_pricing_rules_deprecated` when present, preserving their rows.
- **Status:** source-level retirement-by-rename is present; consumer compatibility
  and name-collision scenarios still require verification.
- **Remaining verification:** identify all runtime and database consumers,
  check whether the destination legacy names already exist, test reruns, and
  document the backup and rollback procedure before applying to any real data.

## Migration runner — separate review track

Pull request #29 introduces a checksum-tracked migration ledger and fail-fast
execution behavior. Its reported CI results are useful evidence for the exact
tested commit, but do not by themselves prove safe adoption by every existing
database.

Before treating that work as production-ready, review and test:
- how databases with previously applied migrations but no ledger are adopted;
- checksum drift and missing/reordered migration handling;
- interruption, rollback, reconnect, and retry behavior;
- concurrent runners and advisory-lock behavior;
- migration SQL that cannot safely run inside a transaction;
- backup, recovery, and operator runbook requirements.

Do not run migrations against real user or financial data until the adoption
path, backup, rollback, and recovery steps have been reviewed and explicitly
approved.

## Evidence discipline

- Recheck the exact file and commit before acting on any item above.
- Keep historical observations distinct from current reproducible failures.
- Mark an item complete only after relevant tests have actually run and their
  results are recorded against a specific commit.
