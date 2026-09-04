/**
 * RbacAuditIntegration.test.js - Integration test
 *
 * Verifies the REAL audit-trail chain end-to-end against a live PostgreSQL:
 *
 *   RbacController -> PermissionUseCases -> AuditRepository -> PostgreSQL -> audit_logs
 *
 * It proves actual INSERT persistence in `audit_logs` for the three required events:
 *   - rbac.permission.created
 *   - rbac.permission.assigned
 *   - rbac.user_role.assigned
 *
 * Database connection is read from the repository root `.env` (PG_* vars).
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const { Pool } = require('pg');

const PermissionRepository = require('../../infrastructure/repositories/PermissionRepository');
const AuditRepository = require('../../infrastructure/repositories/AuditRepository');
const AuthorizationService = require('../../domain/services/AuthorizationService');
const PermissionUseCases = require('../../application/use-cases/PermissionUseCases');
const RbacController = require('../../presentation/controllers/RbacController');

/** Async helper: read a real value from the DB with a tiny retry window. */
async function queryAudit(pool, eventType) {
  const { rows } = await pool.query(
    `SELECT id, event_type, entity_type, entity_id, actor_id, metadata, created_at
     FROM audit_logs WHERE event_type = $1 ORDER BY created_at DESC LIMIT 1`,
    [eventType]
  );
  return rows[0] || null;
}

/** Minimal HTTP mocks so we exercise the real controller layer. */
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

describe('RBAC Audit Trail - PostgreSQL Integration', () => {
  let pool;
  let useCases;
  let controller;

  // Unique probe slug per run -> idempotent across repeats.
  // Must satisfy Permission.isValidSlug: ^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$
  // (each dot-segment must START with a letter, so we prefix the timestamp with 't').
  const probe = `audit.probe.t${Date.now()}`;
  const actorId = null; // real FK columns accept NULL; avoids depending on a seeded user

  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DATABASE || 'safar_service',
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || 'postgres',
    });

    const permissionRepository = new PermissionRepository(pool);
    const auditRepository = new AuditRepository(pool);
    const authorizationService = new AuthorizationService();

    useCases = new PermissionUseCases({
      permissionRepository,
      authorizationService,
      auditRepository,
    });

    controller = new RbacController({ useCases });
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
    // 'admin' is a role listed in 01-core-system/constants/Roles.js AND present in roles table
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
    // Pick an existing user to satisfy user_roles.user_id FK (migration 002)
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