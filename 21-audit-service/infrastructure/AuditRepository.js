/**
 * AuditRepository.js - Data Access Layer for audit_logs table
 *
 * Persists domain events with correlation ID for security
 * and business audit trail.
 */

class AuditRepository {
  constructor(pool) {
    this._pool = pool;
  }

  /**
   * Insert an audit log entry
   * @param {string} eventName - Name of the domain event
   * @param {object} payload - Event data (will be JSONB)
   * @param {string|null} correlationId - Correlation ID from request context
   * @returns {Promise<object>} Inserted record
   */
  async insert(eventName, payload, correlationId = null) {
    const query = `
      INSERT INTO audit_logs (event_name, payload, correlation_id)
      VALUES ($1, $2, $3)
      RETURNING id, event_name, payload, correlation_id, created_at
    `;
    const values = [eventName, JSON.stringify(payload), correlationId];
    const { rows } = await this._pool.query(query, values);
    return rows[0];
  }

  /**
   * Find audit logs by correlation ID
   * @param {string} correlationId
   * @returns {Promise<Array>}
   */
  async findByCorrelationId(correlationId) {
    const query = `
      SELECT id, event_name, payload, correlation_id, created_at
      FROM audit_logs
      WHERE correlation_id = $1
      ORDER BY created_at ASC
    `;
    const { rows } = await this._pool.query(query, [correlationId]);
    return rows;
  }

  /**
   * Find audit logs by event name
   * @param {string} eventName
   * @param {number} limit
   * @returns {Promise<Array>}
   */
  async findByEventName(eventName, limit = 100) {
    const query = `
      SELECT id, event_name, payload, correlation_id, created_at
      FROM audit_logs
      WHERE event_name = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
    const { rows } = await this._pool.query(query, [eventName, limit]);
    return rows;
  }
}

module.exports = AuditRepository;
