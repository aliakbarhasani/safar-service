'use strict';

/**
 * Deprecated standalone migration entry point.
 *
 * This script previously executed V1_0__create_pricing_tables.sql directly,
 * bypassing the canonical runner's schema_migrations ledger, checksum checks,
 * ordered-history validation, and advisory lock.
 *
 * Use `npm run db:migrate` instead. It includes this SQL file in the ordered
 * migration manifest and applies it only after the normal safety checks.
 */

function main() {
  console.error(
    'Unsafe legacy migration runner disabled. Use "npm run db:migrate" to run the ordered, checksum-validated migration process.'
  );
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = { main };
