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
];

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
    
    // Line comment -- (skip entire line)
    if (!inDollar && !inQuote && !inBlockComment && ch === '-' && next === '-') {
      inLineComment = true;
      while (i < sql.length && sql[i] !== '\n') i++;
      inLineComment = false;
      continue;
    }
    
    // Block comment /* */
    if (!inDollar && !inQuote && !inLineComment && ch === '/' && next === '*') {
      inBlockComment = true;
      i += 2;
      while (i < sql.length && !(sql[i] === '*' && i + 1 < sql.length && sql[i + 1] === '/')) i++;
      i++; // skip */
      inBlockComment = false;
      continue;
    }
    
    if (inLineComment || inBlockComment) { current += ch; continue; }
    
    // Dollar-quoted string $$...$$ or $tag$...$tag$
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
    
    // Single quote
    if (!inDollar && ch === "'") { inQuote = !inQuote; current += ch; continue; }
    
    // Semicolon at top level = statement separator
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
  const client = new Client({
    host: config.pg.host, port: config.pg.port,
    database: config.pg.database, user: config.pg.user,
    password: config.pg.password,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();

  console.log('==============================================');
  console.log('  SAFAR SERVICE - ALL DATABASE MIGRATIONS');
  console.log('==============================================');
  console.log(`Host: ${config.pg.host}:${config.pg.port}`);
  console.log(`Database: ${config.pg.database}`);
  console.log(`Total migrations: ${MIGRATION_ORDER.length}`);
  console.log('----------------------------------------------');

  let totalSuccess = 0, totalFail = 0;

  for (const migrationFile of MIGRATION_ORDER) {
    const migrationPath = path.join(MIGRATIONS_DIR, migrationFile);
    if (!fs.existsSync(migrationPath)) { console.log(`⚠ ${migrationFile} not found, skipping...`); continue; }
    
    console.log(`\n⏳ ${migrationFile}...`);
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    const statements = splitSQL(sql);
    console.log(`  📄 ${statements.length} statements`);
    
    let fileOk = 0, fileFail = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
        fileOk++;
      } catch (err) {
        const ignoreList = ['already exists', 'duplicate', '42710', '42P07', '42P04'];
        if (ignoreList.some(e => err.message.includes(e) || err.code === e)) {
          fileOk++; // count as success when already exists
        } else {
          console.error(`  ✗ ${err.message.substring(0, 150)}`);
          fileFail++;
        }
      }
    }
    totalSuccess += fileOk; totalFail += fileFail;
    console.log(`  ✓ ${fileOk} ok, ${fileFail} errors`);
  }

  console.log('\n==============================================');
  console.log(`  Total: ${totalSuccess} ok, ${totalFail} errors`);
  console.log('==============================================');
  await client.end();
}

runAllMigrations();
