/**
 * clean-schema.js - پاکسازی کامل دیتابیس
 *
 * این ابزار مخرب است و فقط برای دیتابیس توسعه/آزمایش با تأیید نام دقیق
 * دیتابیس هدف قابل اجراست. برای مهاجرت عادی از npm run db:migrate استفاده کنید.
 */
'use strict';

const { Client } = require('pg');
const config = require('../../../14-config-system/server.config');

function assertSchemaResetAllowed(env = process.env, targetDatabase = config.pg.database) {
  if (!['development', 'test'].includes(env.NODE_ENV)) {
    throw new Error('NODE_ENV must be explicitly set to development or test.');
  }
  if (env.ALLOW_SCHEMA_RESET !== 'true') {
    throw new Error('Set ALLOW_SCHEMA_RESET=true to explicitly authorize schema destruction.');
  }
  if (!env.CONFIRM_DATABASE_NAME || env.CONFIRM_DATABASE_NAME !== targetDatabase) {
    throw new Error('CONFIRM_DATABASE_NAME must exactly match the configured target database name.');
  }
}

async function cleanSchema() {
  try {
    assertSchemaResetAllowed();
  } catch (error) {
    console.error('❌ Refused: ' + error.message);
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    host: config.pg.host,
    port: config.pg.port,
    database: config.pg.database,
    user: config.pg.user,
    password: config.pg.password,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    console.log(`Connected to ${config.pg.host}:${config.pg.port}/${config.pg.database}`);

    await client.query('DROP SCHEMA public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    console.log('Database schema reset successfully.');
  } catch (err) {
    console.error('❌ Error cleaning database:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch((error) => {
      console.error('❌ Error closing database connection:', error.message);
      process.exitCode = 1;
    });
  }
}

if (require.main === module) {
  cleanSchema();
}

module.exports = { cleanSchema, assertSchemaResetAllowed };
