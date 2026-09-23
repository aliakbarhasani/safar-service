/**
 * PricingRbacAndCalculation.integration.test.js
 *
 * Integration tests for the Pricing Engine API:
 *  1. Price calculation is PUBLIC and driven by pricing_configs from the DB (dynamic, no hardcode).
 *  2. Pricing config management (CRUD) is RBAC-protected: super_admin ONLY.
 *
 * Requires live PostgreSQL (skip gracefully when DB is unavailable).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = require('../../run-server');

// SECURITY (P0): توکن تست فقط با RS256 و کلید خصوصی واقعی سرویس امضا می‌شود.
const PRIVATE_KEY = fs.readFileSync(
  path.resolve(__dirname, '..', '..', '..', '00-infrastructure', 'keys', 'jwt_private.pem'),
  'utf8'
);

const dbPool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: +process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'safar_service',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD,
  connectionTimeoutMillis: 3000,
});

function signToken(role) {
  return jwt.sign(
    { userId: 'pricing-test-user', phoneNumber: '+989120000090', role, type: 'access' },
    PRIVATE_KEY,
    { algorithm: 'RS256', expiresIn: '1h' }
  );
}

async function isDbAvailable() {
  try {
    await dbPool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

describe('Pricing Engine - dynamic calculation & RBAC (live Postgres)', () => {
  let dbUp = false;

  beforeAll(async () => {
    dbUp = await isDbAvailable();
  }, 10000);

  describe('price calculation', () => {
    test('POST /api/v1/pricing/calculate is public and uses DB values (urban_taxi)', async () => {
      if (!dbUp) return;
      const res = await request(app)
        .post('/api/v1/pricing/calculate')
        .send({ serviceType: 'urban_taxi', distanceKm: 10, durationMin: 15, scopeType: 'City', scopeId: 'default' });
      expect(res.status).toBe(200);
      expect(res.body.data.totalPrice).toBe(95000); // 15000 + 5000*10 + 2000*15 from pricing_configs
      expect(res.body.data.breakdown.baseFare).toBe(15000);
    }, 15000);

    test('POST /api/v1/pricing/calculate for a service without its own config falls back to default', async () => {
      if (!dbUp) return;
      const res = await request(app)
        .post('/api/v1/pricing/calculate')
        .send({ serviceType: 'unknown_service', distanceKm: 5, durationMin: 10, scopeType: 'City', scopeId: 'default' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }, 15000);
  });

  describe('pricing config management (RBAC: super_admin only)', () => {
    test('GET /api/v1/pricing/configs returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/pricing/configs');
      expect(res.status).toBe(401);
    });

    test('GET /api/v1/pricing/configs returns 403 for a non-super-admin role', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/configs')
        .set('Authorization', `Bearer ${signToken('seller')}`);
      expect(res.status).toBe(403);
    });

    test('POST /api/v1/pricing/configs returns 403 for a non-super-admin role', async () => {
      const res = await request(app)
        .post('/api/v1/pricing/configs')
        .set('Authorization', `Bearer ${signToken('admin')}`)
        .send({ name: 'X' });
      // admin is NOT super_admin -> forbidden
      expect(res.status).toBe(403);
    });

    test('GET /api/v1/pricing/configs returns 200 for super_admin', async () => {
      const res = await request(app)
        .get('/api/v1/pricing/configs')
        .set('Authorization', `Bearer ${signToken('super_admin')}`);
      expect(res.status).toBe(200);
    });
  });

  afterAll(async () => {
    try {
      await dbPool.end();
    } catch {
      /* ignore */
    }
  }, 5000);
});