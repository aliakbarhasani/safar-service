/**
 * RbacAuditIntegration.test.js - Integration test
 *
 * Verifies the REAL audit-trail chain end-to-end against a live PostgreSQL.
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { Pool } = require('pg');

const PermissionRepository = require('../../infrastructure/repositories/PermissionRepository');
const AuditRepository = require('../../infrastructure/repositories/AuditRepository');
const AuthorizationService = require('../../domain/services/AuthorizationService');
const PermissionUseCases = require('../../application/use-cases/PermissionUseCases');
const RbacController = require('../../presentation/controllers/RbacController');

function queryAudit(pool, eventType) {
  return pool.query(
    `SELECT id, event_type, entity_type, entity_id, actor_id, metadata, created_at
     FROM audit_logs WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`,
    [eventType]
  ).then(({ rows }) => rows[0] || null);
}

function makeRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) { statusCode = code; return this; },
    json(payload) { body = payload; return this; },
    _status() { return statusCode; },
    _body() { return body; },
  };
}

function connectionConfig() {
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    return {
      host: url.hostname,
      port: Number(url.port || 5432),
      database: decodeURIComponent(url.pathname.replace(/^\//, '')),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
    };
  }
  return {
    host: process.env.PG_HOST || '127.0.0.1',
    port: Number(process.env.PG_PORT || 5432),
    database: process.env.PG_DATABASE || 'safar_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
  };
}

describe('RBAC Audit Trail - PostgreSQL Integration', () => {
  let pool;
  let controller;

  const probe = `audit.probe.t${Date.now()}`;
  const actorId = null;

  beforeAll(async () => {
    pool = new Pool(connectionConfig());

    const permissionRepository = new PermissionRepository(pool);
    const auditRepository = new AuditRepository(pool);
    const authorizationService = new AuthorizationService();

    controller = new RbacController({
      useCases: new PermissionUseCases({
        permissionRepository,
        authorizationService,
        auditRepository,
      }),
    });

    // Migrations create the schema, but do not create application users.
    // Seed one disposable test user only when the isolated DB is empty.
    const existing = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
    if (existing.rows.length === 0) {
      await pool.query(
        `INSERT INTO users (
           first_name, last_name, phone_number, password_hash, role, status
         ) VALUES ($1, $2, $3, $4, 'passenger', 'active')`,
        ['RBAC', 'Integration', `+test-${Date.now()}`, 'integration-test-password-hash']
      );
    }
  });

  afterAll(async () => {
    if (pool) await pool.end();
  });

  test('chain persists rbac.permission.created via Real repository/PostgreSQL', async () => {
    const res = makeRes();
    await controller.createPermission(
      { body: { slug: probe, description: 'audit probe permission', moduleName: 'audit' }, user: { userId: actorId } },
      res
    );
    expect(res._status()).toBe(201);

    const row = await queryAudit(pool, 'rbac.permission.created');
    expect(row).not.toBeNull();
    expect(row.event_type).toBe('rbac.permission.created');
    expect(row.metadata).toMatchObject({ slug: probe });
  });

  test('chain persists rbac.permission.assigned via Real repository/PostgreSQL', async () => {
    const res = makeRes();
    await controller.assignPermission(
      { params: { role: 'admin' }, body: { slug: probe }, user: { userId: actorId } },
      res
    );
    expect([200, 201]).toContain(res._status());

    const row = await queryAudit(pool, 'rbac.permission.assigned');
    expect(row).not.toBeNull();
    expect(row.event_type).toBe('rbac.permission.assigned');
    expect(row.metadata).toMatchObject({ roleName: 'admin', slug: probe });
  });

  test('chain persists rbac.user_role.assigned via Real repository/PostgreSQL', async () => {
    const u = await pool.query('SELECT id FROM users ORDER BY created_at LIMIT 1');
    expect(u.rows.length).toBeGreaterThan(0);
    const userId = u.rows[0].id;

    const res = makeRes();
    await controller.assignUserRole(
      { params: { userId }, body: { roleName: 'admin' }, user: { userId: actorId } },
      res
    );
    expect([200, 201, 400, 404]).toContain(res._status());

    const row = await queryAudit(pool, 'rbac.user_role.assigned');
    expect(row).not.toBeNull();
    expect(row.event_type).toBe('rbac.user_role.assigned');
    expect(row.entity_id).toBe(userId);
  });
});
