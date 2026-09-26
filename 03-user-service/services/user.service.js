const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getPool } = require('../../01-core-system/database/db');

function normalizeName(name = '') {
  const value = String(name).trim();
  if (!value) return { firstName: '', lastName: '' };
  const parts = value.split(/\s+/);
  return {
    firstName: parts.shift() || '',
    lastName: parts.join(' ') || '-',
  };
}

function normalizeRole(role) {
  const value = String(role || 'passenger').trim().toLowerCase();
  const aliases = {
    user: 'passenger',
    seller: 'provider',
    advertiser: 'provider',
  };
  return aliases[value] || value;
}

function assertAllowedRole(role) {
  const allowed = new Set(['passenger', 'driver', 'provider', 'admin', 'super_admin', 'courier']);
  if (!allowed.has(role)) throw new Error('Invalid user role');
}

async function createUser(data) {
  const pool = getPool();
  const { firstName, lastName } = normalizeName(data.name);
  if (!firstName || !data.phone) throw new Error('name and phone are required');

  const role = normalizeRole(data.role);
  assertAllowedRole(role);

  // This legacy admin-facing endpoint does not receive a password.
  // Generate an unusable-by-default random password rather than storing
  // a hard-coded credential. Normal authentication remains OTP-based.
  const password = data.password || crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users
      (first_name, last_name, phone_number, password_hash, role, status, is_phone_verified)
     VALUES ($1, $2, $3, $4, $5::user_role, 'active'::user_status, FALSE)
     RETURNING id, first_name, last_name, phone_number, email, role, status, created_at`,
    [firstName, lastName, String(data.phone).trim(), passwordHash, role],
  );

  return result.rows[0];
}

async function getAllUsers() {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, first_name, last_name, phone_number, email, role, status,
            country_id, preferred_currency_id, avatar_url,
            is_phone_verified, is_email_verified, last_login_at, created_at, updated_at
       FROM users
      WHERE deleted_at IS NULL
      ORDER BY created_at DESC`,
  );
  return result.rows;
}

async function getUserById(id) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, first_name, last_name, phone_number, email, role, status,
            country_id, preferred_currency_id, avatar_url,
            is_phone_verified, is_email_verified, last_login_at, created_at, updated_at
       FROM users
      WHERE id = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [id],
  );
  return result.rows[0] || null;
}

async function getUserByPhone(phone) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT id, first_name, last_name, phone_number, email, password_hash,
            role, status, country_id, preferred_currency_id,
            avatar_url, is_phone_verified, is_email_verified,
            last_login_at, created_at, updated_at
       FROM users
      WHERE phone_number = $1 AND deleted_at IS NULL
      LIMIT 1`,
    [String(phone).trim()],
  );
  return result.rows[0] || null;
}

module.exports = {
  createUser,
  getAllUsers,
  getUserById,
  getUserByPhone,
};
