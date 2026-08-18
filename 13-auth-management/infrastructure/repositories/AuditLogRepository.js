const { Pool } = require('pg');

/**
 * AuditLogRepository
 * Persists system-wide audit entries to the `security_audit_logs` table.
 * Falls back to in-memory store when PostgreSQL is unavailable.
 */
class AuditLogRepository {
  constructor() {
    this.pool = null;
    this.inMemoryStore = [];
    this._initPool();
  }

  _initPool() {
    try {
      this.pool = new Pool({
        host: process.env.PG_HOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT, 10) || 5432,
        database: process.env.PG_DATABASE || 'safar_service',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[AuditLogRepository] PostgreSQL init failed:', err.message);
      this.pool = null;
    }
  }

  async _isDBReady() {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Record an audit log entry.
   * @param {Object} entry - { userId, action, moduleName, entityType, entityId, oldValues, newValues, ipAddress, userAgent, metadata }
   */
  async record(entry) {
    const {
      userId = null,
      action,
      moduleName = 'auth',
      entityType = null,
      entityId = null,
      oldValues = null,
      newValues = null,
      ipAddress = null,
      userAgent = null,
      metadata = null,
    } = entry;

    const oldJson = oldValues ? JSON.stringify(oldValues) : null;
    const newJson = newValues ? JSON.stringify(newValues) : null;
    const metaJson = metadata ? JSON.stringify(metadata) : null;

    if (await this._isDBReady()) {
      try {
        await this.pool.query(
          `INSERT INTO security_audit_logs
            (user_id, action, module_name, entity_type, entity_id, old_values, new_values, ip_address, user_agent, metadata, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
          [userId, action, moduleName, entityType, entityId, oldJson, newJson, ipAddress, userAgent, metaJson]
        );
        return true;
      } catch (err) {
        console.warn('[AuditLogRepository] DB record failed:', err.message);
      }
    }

    // In-memory fallback
    this.inMemoryStore.push({
      userId,
      action,
      moduleName,
      entityType,
      entityId,
      oldValues,
      newValues,
      ipAddress,
      userAgent,
      metadata,
      createdAt: new Date().toISOString(),
    });
    return true;
  }

  /**
   * Find audit logs by action.
   * @param {string} action
   * @param {number} limit
   */
  async findByAction(action, limit = 50) {
    if (await this._isDBReady()) {
      try {
        const result = await this.pool.query(
          `SELECT id, user_id, action, module_name, entity_type, entity_id, old_values, new_values, ip_address, user_agent, metadata, created_at
           FROM security_audit_logs
           WHERE action = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [action, limit]
        );
        return result.rows;
      } catch (err) {
        console.warn('[AuditLogRepository] DB query failed:', err.message);
      }
    }

    return this.inMemoryStore
      .filter((e) => e.action === action)
      .slice(-limit)
      .reverse();
  }

  /**
   * Find audit logs by user.
   * @param {string} userId
   * @param {number} limit
   */
  async findByUser(userId, limit = 50) {
    if (await this._isDBReady()) {
      try {
        const result = await this.pool.query(
          `SELECT id, user_id, action, module_name, entity_type, entity_id, old_values, new_values, ip_address, user_agent, metadata, created_at
           FROM security_audit_logs
           WHERE user_id = $1
           ORDER BY created_at DESC
           LIMIT $2`,
          [userId, limit]
        );
        return result.rows;
      } catch (err) {
        console.warn('[AuditLogRepository] DB query failed:', err.message);
      }
    }

    return this.inMemoryStore
      .filter((e) => e.userId === userId)
      .slice(-limit)
      .reverse();
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = AuditLogRepository;