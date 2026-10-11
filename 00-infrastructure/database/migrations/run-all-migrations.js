/**
 * run-all-migrations.js - اجرای همه Migrationهای دیتابیس
 *
 * Usage: node run-all-migrations.js
 *
 * این اسکریپت تمام فایل‌های SQL را به ترتیب اجرا می‌کند
 * و وضعیت هر Migration را گزارش می‌دهد
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../../../14-config-system/server.config');

const MIGRATIONS_DIR = __dirname;

// PostgreSQL codes that specifically indicate an existing schema object.
const IDEMPOTENT_MIGRATION_ERROR_CODES = new Set(['42710', '42P07', '42P04', '42701']);

function isIdempotentMigrationError(error) {
  return Boolean(error && IDEMPOTENT_MIGRATION_ERROR_CODES.has(String(error.code || '')));
}

const MIGRATION_ORDER = [
  '001_initial_global_schema.sql',
  '002_extended_global_schema.sql',
  '003_auth_finance_support_schema.sql',
  '004_wallet_advanced_financials.sql',
  '005_financial_integrity_constraints.sql',
  '006_trip_engine_concurrency_and_timeline.sql',
  '007_auth_otp_tables.sql',
  '008_jwt_sessions.sql',
  '009_user_profiles_settings.sql',
  '010_rbac_tables.sql',
  '011_security_audit_tables.sql',
  '012_seller_advertiser_roles.sql',
  '013_pricing_configs.sql',
  '014_pricing_quotes_audit.sql',
  '015_quotes_audit_final.sql',
  '016_create_rides_tables.sql',
  'V1_0__create_pricing_tables.sql',
  '017_create_quotes_and_audit.sql',
  '018_cleanup_legacy_pricing.sql',
  '019_unify_roles_and_services.sql',
  '020_merge_ride_into_trip.sql',
  '022_create_driver_tables.sql',
  '023_create_driver_location_history.sql',
  '024_create_feedback_schema.sql',
  '025_create_audit_logs.sql',
  '026_create_promo_schema.sql',
  '027_create_outbox_table.sql',
  '028_create_inbox_table.sql',
  '029_add_soft_delete_columns.sql',
  '030_wallet_debt_support.sql',
  '031_wallet_currency_integrity.sql',
];

function findMissingMigrationFiles(migrationOrder, directory = MIGRATIONS_DIR, fileExists = fs.existsSync) {
  return migrationOrder.filter((filename) => !fileExists(path.join(directory, filename)));
}

/**
 * جدا کردن دستورات SQL با رعایت dollar-quoted strings و single quotes
 */
function splitSQL(sql) {
  const statements = [];
  let current = '';
  let inDollar = false;
  let inQuote = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (!inDollar && !inQuote && !inBlockComment && ch === '-' && next === '-') {
      inLineComment = true;
      while (i < sql.length && sql[i] !== '\\n') i++;
      inLineComment = false;
      continue;
    }

    if (!inDollar && !inQuote && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/')) i++;
      i++;
      inBlockComment = false;
      continue;
    }

    if (inLineComment || inBlockComment) {
      current += ch;
      continue;
    }

    if (!inQuote && ch === '$') {
      const endIdx = sql.indexOf('$', i + 1);
      if (endIdx > i) {
        const tag = sql.substring(i + 1, endIdx);
        const closeTag = '$' + tag + '$';
        const closeIdx = sql.indexOf(closeTag, endIdx + 1);
        if (closeIdx > i) {
          current += sql.substring(i, closeIdx + closeTag.length);
          i = closeIdx + closeTag.length - 1;
          continue;
        }
      }
    }

    if (!inDollar && ch === "'") {
      inQuote = !inQuote;
      current += ch;
      continue;
    }

    if (!inDollar && !inQuote && ch === ';') {
      const trimmed = current.trim();
      const upper = trimmed.toUpperCase();
      if (trimmed && !trimmed.startsWith('--') && upper !== 'BEGIN' && upper !== 'COMMIT') {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += ch;
  }

  const trimmed = current.trim();
  if (trimmed && !trimmed.startsWith('--')) statements.push(trimmed);
  return statements;
}

async function runAllMigrations() {
  // A missing file must never be silently skipped: doing so can leave a
  // partially upgraded schema while reporting a successful migration run.
  const missingFiles = findMissingMigrationFiles(MIGRATION_ORDER);
  if (missingFiles.length > 0) {
    const error = new Error(`Required migration file(s) missing: ${missingFiles.join(', ')}`);
    error.code = 'MIGRATION_FILES_MISSING';
    throw error;
  }

  const client = new Client({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    connectionTimeoutMillis: 5000,
  });

  await client.connect();

  try {
    console.log('==============================================');
    console.log('  SAFAR SERVICE - ALL DATABASE MIGRATIONS');
    console.log('==============================================');
    console.log(`Host: ${config.pg.host}:${config.pg.port}`);
    console.log(`Database: ${config.pg.database}`);
    console.log(`Total migrations: ${MIGRATION_ORDER.length}`);
    console.log('----------------------------------------------');

    let totalSuccess = 0;
    let totalFail = 0;

    for (const migrationFile of MIGRATION_ORDER) {
      const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
      console.log(`\\n⏳ ${migrationFile}...`);
      const sql = fs.readFileSync(migrationPath, 'utf-8');
      const statements = splitSQL(sql);
      console.log(`  📄 ${statements.length} statements`);

      let fileOk = 0;
      let fileFail = 0;
      for (const stmt of statements) {
        try {
          await client.query(stmt);
          fileOk++;
        } catch (err) {
          // Ignore only narrowly identified DDL object-exists errors. Data
          // conflicts and unknown errors must fail the migration run.
          if (isIdempotentMigrationError(err)) {
            fileOk++;
            console.warn(`  ⚠ ignored idempotent DDL conflict [${err.code}]`);
          } else {
            console.error(`  ✗ [${err.code || 'NO_SQLSTATE'}] ${String(err.message || err).substring(0, 150)}`);
            fileFail++;
          }
        }
      }

      totalSuccess += fileOk;
      totalFail += fileFail;
      console.log(`  ✓ ${fileOk} ok, ${fileFail} errors`);
    }

    console.log('\\n==============================================');
    console.log(`  Total: ${totalSuccess} ok, ${totalFail} errors`);
    console.log('==============================================');

    if (totalFail > 0) {
      const error = new Error(`Migration run aborted — ${totalFail} SQL statement(s) failed.`);
      error.code = 'MIGRATION_SQL_FAILED';
      throw error;
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  runAllMigrations().catch((error) => {
    console.error(`Migration runner failed [${error.code || 'UNKNOWN'}]: ${error.message || error}`);
    process.exitCode = 1;
  });
}

module.exports = {
  runAllMigrations,
  splitSQL,
  isIdempotentMigrationError,
  findMissingMigrationFiles,
};
