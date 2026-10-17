'use strict';

const { spawn } = require('child_process');
const net = require('net');
const request = require('supertest');
const { Pool } = require('pg');
const Redis = require('ioredis');
const JwtService = require('../../13-auth-management/domain/services/JwtService');
const SessionManager = require('../../13-auth-management/domain/services/SessionManager');
const SessionRepository = require('../../13-auth-management/infrastructure/repositories/SessionRepository');

const ORIGIN = { lat: 35.6997, lng: 51.3378 };
const DESTINATION = { lat: 35.6892, lng: 51.389 };
const SERVICE_TYPE = 'urban_taxi';

async function findAvailablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForGateway(baseUrl, child, getOutput, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Gateway exited before becoming ready (code ${child.exitCode}).\n${getOutput()}`);
    }
    try {
      const response = await request(baseUrl).get('/').timeout({ response: 1000, deadline: 1500 });
      if (response.status < 500) return;
      lastError = new Error(`Gateway returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Gateway did not become ready: ${lastError?.message || 'timeout'}\n${getOutput()}`);
}

describe('Full API Gateway trip journey (PostgreSQL + Redis + real HTTP)', () => {
  let pool;
  let sessionRepository;
  let redisClient;
  let gateway;
  let baseUrl;
  let gatewayOutput = '';
  let passengerId;
  let phoneNumber;
  let sessionId;
  let accessToken;
  let quoteId;
  let tripId;
  let dbAvailable = false;

  const appendOutput = (chunk) => {
    gatewayOutput = (gatewayOutput + chunk.toString()).slice(-12000);
  };

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5433),
      database: process.env.PG_DATABASE || 'safar_test_db',
      user: process.env.PG_USER || 'test_user',
      password: process.env.PG_PASSWORD || 'test_password',
      max: 4,
      connectionTimeoutMillis: 4000,
    });

    try {
      await pool.query('SELECT 1');
      const pricingConfig = await pool.query(
        "SELECT id FROM pricing_configs WHERE service_type = $1 AND status = 'active' LIMIT 1",
        [SERVICE_TYPE],
      );
      if (pricingConfig.rows.length === 0) {
        throw new Error('Missing active urban_taxi pricing config; database migrations must run first.');
      }

      phoneNumber = `+9893${String(Date.now()).slice(-8)}`;
      const user = await pool.query(
        `INSERT INTO users (first_name, last_name, phone_number, password_hash, role)
         VALUES ($1, $2, $3, $4, 'passenger')
         RETURNING id`,
        ['Gateway', 'E2E', phoneNumber, 'test-only-password-hash'],
      );
      passengerId = user.rows[0].id;
      dbAvailable = true;
    } catch (error) {
      if (process.env.REQUIRE_TEST_DATABASE === 'true') throw error;
      console.warn('[gateway-trip-e2e] PostgreSQL unavailable; test skipped:', error.message);
      return;
    }

    const port = await findAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    gateway = spawn(process.execPath, ['01-core-system/server.js'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        PORT: String(port),
        PG_HOST: process.env.PG_HOST || '127.0.0.1',
        PG_PORT: process.env.PG_PORT || '5433',
        PG_DATABASE: process.env.PG_DATABASE || 'safar_test_db',
        PG_USER: process.env.PG_USER || 'test_user',
        PG_PASSWORD: process.env.PG_PASSWORD || 'test_password',
        REDIS_HOST: process.env.REDIS_HOST || '127.0.0.1',
        REDIS_PORT: process.env.REDIS_PORT || '6379',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    gateway.stdout.on('data', appendOutput);
    gateway.stderr.on('data', appendOutput);
    await waitForGateway(baseUrl, gateway, () => gatewayOutput);

    sessionRepository = new SessionRepository();
    const sessionManager = new SessionManager({
      jwtService: new JwtService(),
      sessionRepository,
      userRepository: {},
    });
    const session = await sessionManager.createSession({
      id: passengerId,
      phoneNumber,
      role: 'passenger',
    });
    sessionId = session.sessionId;
    accessToken = session.accessToken;

    redisClient = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
      connectTimeout: 2000,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => (times <= 10 ? 100 : null),
    });
    await redisClient.ping();
  }, 45000);

  afterAll(async () => {
    if (gateway && gateway.exitCode === null) {
      gateway.kill('SIGTERM');
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          if (gateway.exitCode === null) gateway.kill('SIGKILL');
          resolve();
        }, 5000);
        gateway.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    if (redisClient) {
      try {
        if (quoteId) await redisClient.del(`fare_quote:${quoteId}`);
        await redisClient.quit();
      } catch (_) {
        redisClient.disconnect();
      }
    }

    if (pool && dbAvailable) {
      try {
        if (tripId) {
          await pool.query('DELETE FROM trip_timeline WHERE trip_id = $1', [tripId]);
          await pool.query('DELETE FROM trips WHERE id = $1', [tripId]);
        }
        if (quoteId) {
          await pool.query('DELETE FROM pricing_audit_logs WHERE quote_id = $1', [quoteId]);
          await pool.query('DELETE FROM quotes WHERE id = $1', [quoteId]);
        }
        if (sessionId) await pool.query('DELETE FROM user_sessions WHERE id = $1', [sessionId]);
        if (passengerId) await pool.query('DELETE FROM users WHERE id = $1', [passengerId]);
      } catch (error) {
        console.warn('[gateway-trip-e2e] cleanup failed:', error.message);
      }
    }
    if (sessionRepository) sessionRepository.close();
    if (pool) await pool.end();
  });

  test('estimate → authenticated Gateway POST → PostgreSQL trip, while blocking anonymous and duplicate requests', async () => {
    if (!dbAvailable) return;

    const estimate = await request(baseUrl)
      .get('/api/v1/trip/estimate')
      .query({
        originLat: ORIGIN.lat,
        originLng: ORIGIN.lng,
        destLat: DESTINATION.lat,
        destLng: DESTINATION.lng,
        serviceType: SERVICE_TYPE,
      });

    expect(estimate.status).toBe(200);
    expect(estimate.body).toMatchObject({ success: true });
    quoteId = estimate.body.data.quoteId;
    expect(quoteId).toBeTruthy();
    expect(Number(estimate.body.data.estimatedFare)).toBeGreaterThan(0);

    const tripPayload = {
      quoteId,
      serviceType: SERVICE_TYPE,
      originLat: ORIGIN.lat,
      originLng: ORIGIN.lng,
      destLat: DESTINATION.lat,
      destLng: DESTINATION.lng,
      originAddress: 'Gateway E2E origin',
      destinationAddress: 'Gateway E2E destination',
    };

    const anonymous = await request(baseUrl).post('/api/v1/trips').send(tripPayload);
    expect(anonymous.status).toBe(401);

    const before = await pool.query('SELECT COUNT(*)::int AS count FROM trips WHERE quote_id = $1', [quoteId]);
    expect(before.rows[0].count).toBe(0);

    const created = await request(baseUrl)
      .post('/api/v1/trips')
      .set('Cookie', `access_token=${accessToken}`)
      .send(tripPayload);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      success: true,
      data: {
        quoteId,
        passengerId,
        status: 'REQUESTED',
      },
    });
    tripId = created.body.data.tripId;
    expect(tripId).toBeTruthy();

    const duplicate = await request(baseUrl)
      .post('/api/v1/trips')
      .set('Cookie', `access_token=${accessToken}`)
      .send(tripPayload);
    expect(duplicate.status).toBe(409);

    const rows = await pool.query('SELECT id FROM trips WHERE quote_id = $1', [quoteId]);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(tripId);
  });
});
