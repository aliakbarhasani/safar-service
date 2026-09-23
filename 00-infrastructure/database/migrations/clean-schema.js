/**
 * clean-schema.js - پاکسازی کامل دیتابیس
 * 
 * Usage: node clean-schema.js
 * 
 * این اسکریپت Schema public را حذف و دوباره ایجاد می‌کند
 * تا Migrationها روی دیتابیس کاملاً تمیز اجرا شوند
 */
const { Client } = require('pg');
const config = require('../../../14-config-system/server.config');

async function cleanSchema() {
  // ── (P1 — ایمنی) محافظت در برابر اجرای تصادفی مخرب ─────────────────────────
  // این ابزار کل Schema را با `DROP SCHEMA public CASCADE` نابود می‌کند.
  // برای اینکه هرگز به‌طور تصادفی روی محیط عملیاتی/استیجینگ اجرا نشود،
  // اجرا فقط با تأیید صریح محیطی (ALLOW_SCHEMA_RESET=true) و خارج از production مجاز است.
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ Refused: clean-schema.js must never run against production.');
    process.exit(1);
  }
  if (process.env.ALLOW_SCHEMA_RESET !== 'true') {
    console.error(
      '❌ Refused: this script destroys the whole schema. ' +
      'Set ALLOW_SCHEMA_RESET=true to confirm explicitly.'
    );
    process.exit(1);
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

    console.log('Dropping public schema...');
    await client.query('DROP SCHEMA public CASCADE;');
    console.log('✓ public schema dropped');

    console.log('Creating public schema...');
    await client.query('CREATE SCHEMA public;');
    console.log('✓ public schema created');

    console.log('\n✅ Database cleaned successfully - ready for fresh migrations');
  } catch (err) {
    console.error('❌ Error cleaning database:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

cleanSchema();