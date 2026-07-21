/**
 * Migration Runner for V1_0__create_pricing_tables.sql
 * 
 * Usage: node run-migration.js
 * 
 * This script reads the SQL migration file and executes it against
 * the PostgreSQL database configured in the project's server.config.js
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('../../14-config-system/server.config');

async function runMigration() {
  const pool = new Pool(config.pg);
  const migrationPath = path.join(__dirname, 'V1_0__create_pricing_tables.sql');
  
  console.log('========================================');
  console.log('  SAFAR SERVICE - PRICING ENGINE MIGRATION');
  console.log('========================================');
  console.log(`Host: ${config.pg.host}:${config.pg.port}`);
  console.log(`Database: ${config.pg.database}`);
  console.log(`Migration: V1_0__create_pricing_tables.sql`);
  console.log('----------------------------------------');
  
  try {
    // Read the migration file
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    console.log('✓ Migration file loaded successfully');
    
    // Execute the migration
    console.log('⏳ Executing migration...');
    await pool.query(sql);
    console.log('✓ Migration executed successfully!');
    
    // Verify the tables were created
    const tables = ['pricing_rules', 'dynamic_multipliers', 'price_quotes', 'pricing_timeline'];
    for (const table of tables) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = $1)`,
        [table]
      );
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✓' : '✗'} Table "${table}" ${exists ? 'created' : 'NOT found'}`);
    }
    
    // Verify triggers
    const triggers = ['trg_pricing_rules_update', 'trg_dynamic_multipliers_update', 'trg_price_quotes_update', 'trg_prevent_quote_modification'];
    for (const trigger of triggers) {
      const result = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = $1)`,
        [trigger]
      );
      const exists = result.rows[0].exists;
      console.log(`  ${exists ? '✓' : '✗'} Trigger "${trigger}" ${exists ? 'created' : 'NOT found'}`);
    }
    
    console.log('========================================');
    console.log('  MIGRATION COMPLETED SUCCESSFULLY');
    console.log('========================================');
    
  } catch (err) {
    console.error('✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();