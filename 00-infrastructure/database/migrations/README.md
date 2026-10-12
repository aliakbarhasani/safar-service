# Database migration safety

## Normal operation

Run migrations with `npm run db:migrate`. The runner keeps a `public.schema_migrations` row for each applied SQL file. The migration ID is the exact filename and the checksum is SHA-256 of the file's UTF-8 bytes.

- Each migration file and its ledger row are committed in the same PostgreSQL transaction.
- A PostgreSQL advisory lock prevents two runner instances from applying migrations concurrently.
- Successfully applied files are skipped on later runs.
- If an applied file's checksum changes, a ledger entry refers to an unknown migration, or the ledger has an ordering gap, execution stops before applying pending migrations.
- A failed SQL statement rolls back its migration and is not recorded as applied.

Do not edit a migration file after it has been applied to any shared database. Add a new migration file instead. Do not suppress duplicate-object or constraint errors to make a migration appear successful.

## Existing databases without a ledger

The runner deliberately refuses to create an empty ledger over a database that already contains application objects. This is intentional: automatically marking every historical migration as applied could hide a partial or incompatible schema.

For an existing database, use this controlled adoption process with a database administrator:

1. Take a verified backup and test that it can be restored. Do not perform the first attempt on production.
2. Restore the backup to an isolated staging database and compare its schema, constraints, indexes, functions, and migration-related data with the expected result of the ordered migration set.
3. Confirm which migrations are fully applied, in order, and that each migration's effects match the exact file contents. A partially applied migration or a schema that only looks similar is not sufficient.
4. Compute each confirmed file's SHA-256 checksum from the exact repository revision being adopted. Record only the verified contiguous prefix in `public.schema_migrations`; never bulk-mark migrations applied merely to silence the runner.
5. Run the migration runner against the staging copy twice. Confirm the first run applies only genuinely pending files, the second run applies none, and the application regression tests pass.
6. Take a fresh production backup, schedule a maintenance window, repeat the verified adoption procedure, then run the migrations and perform smoke checks. Keep the backup until the release is accepted.

If the schema is partial, out of order, or cannot be verified, stop and reconcile it explicitly with a reviewed repair migration or restore. Do not manually insert guessed ledger rows.

## Rollback and recovery

Prefer a reviewed forward-fix migration for a live database. SQL rollback is not always safe: DDL can be transactional in PostgreSQL, but committed data changes may be irreversible. Before deployment, define the backup, restore point, owner, maintenance window, and verification steps. Never run destructive schema changes against production without a tested restore path.

## CI coverage

The Backend CI job runs migrations against a clean, isolated PostgreSQL database, runs them a second time to verify repeatability, and deliberately alters a checksum to confirm drift is rejected. Unit tests cover transaction rollback, ledger ordering, unknown migration IDs, missing migration files, and unsafe automatic baselining. PostgreSQL integration tests verify that failed DDL/data changes roll back and failed migrations do not create ledger rows.

## Promo usage idempotency migration (033)

Migration `033_promo_usage_trip_idempotency.sql` adds a unique partial index on non-null `promo_usages.trip_id`. It intentionally does not delete or rewrite historical usage records. Existing duplicate trip IDs must be reviewed and reconciled manually before the index can be created.

Before applying migration 033 to any existing/shared database, run the read-only preflight against the explicitly selected target database:

```sh
PG_HOST=... PG_PORT=5432 PG_DATABASE=... PG_USER=... PG_PASSWORD=... node scripts/preflight-promo-usage-idempotency.js
```

Set the environment variables in your shell or secret manager; do not commit credentials to the repository. The script refuses to connect unless host, database, username, and password are explicitly supplied. It opens a PostgreSQL `READ ONLY` transaction, reports only aggregate duplicate counts, and never changes data. Exit code `0` means no duplicate trip IDs were found; exit code `2` means stop and manually reconcile duplicates after a verified backup; exit code `1` means the check could not safely complete. A successful preflight is not a substitute for the normal migration backup and release checks.
