'use strict';

/**
 * InboxRepository.js - Infrastructure (P12)
 *
 * لایه دسترسی داده برای «Idempotent Inbox»:
 *   - `markProcessed(...)`: درج اتمیک (handler_name, event_id) با
 *       ON CONFLICT DO NOTHING؛ اگر ردیفی برنگردد یعنی رویداد قبلاً پردازش شده.
 *   - `isProcessed(...)`  : بررسی صرف‌خواندنی
 *   - `removeClaim(...)`  : compensate — در صورت خطای هندلر، ادعا برداشته می‌شود
 *       تا رویداد در تلاش مجدد قابل پردازش باشد.
 *
 * کلید اصلی ترکیبی (handler_name, event_id) تضمین می‌کند هر هندلر هر رویداد
 * را حداکثر یکبار پردازش کند (Exactly-once در سطح مصرف‌کننده).
 */

class InboxRepository {
  /**
   * @param {Object} deps
   * @param {import('pg').Pool} deps.pool - استخر اتصال PostgreSQL
   */
  constructor({ pool = null } = {}) {
    if (!pool) throw new Error('InboxRepository requires a pg pool');
    this.pool = pool;
  }

  /** @private */
  _executor(client = null) {
    return client || this.pool;
  }

  /**
   * ادعای پردازش یک رویداد توسط یک هندلر.
   * @returns {Promise<boolean>} true اگر اولین بار باشد؛ false اگر تکراری باشد
   */
  async markProcessed({ handlerName, eventId, eventType = 'unknown', payload = {} } = {}, client = null) {
    if (!handlerName || !eventId) {
      const error = new Error('InboxRepository.markProcessed: handlerName و eventId الزامی هستند.');
      error.code = 'INBOX_MARK_VALIDATION';
      throw error;
    }

    const query = `
      INSERT INTO inbox_events (handler_name, event_id, event_type, payload)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (handler_name, event_id) DO NOTHING
      RETURNING handler_name, event_id, processed_at
    `;
    const { rows } = await this._executor(client).query(query, [
      String(handlerName),
      String(eventId),
      String(eventType || 'unknown'),
      JSON.stringify(payload || {}),
    ]);
    return rows.length > 0;
  }

  /** آیا این رویداد قبلاً توسط این هندلر پردازش شده است؟ */
  async isProcessed({ handlerName, eventId } = {}, client = null) {
    if (!handlerName || !eventId) {
      throw new Error('InboxRepository.isProcessed: handlerName و eventId الزامی هستند.');
    }
    const query = `
      SELECT 1 FROM inbox_events WHERE handler_name = $1 AND event_id = $2 LIMIT 1
    `;
    const { rows } = await this._executor(client).query(query, [String(handlerName), String(eventId)]);
    return rows.length > 0;
  }

  /** حذف ادعا (compensating action پس از خطای هندلر). */
  async removeClaim({ handlerName, eventId } = {}, client = null) {
    if (!handlerName || !eventId) {
      throw new Error('InboxRepository.removeClaim: handlerName و eventId الزامی هستند.');
    }
    const query = `
      DELETE FROM inbox_events WHERE handler_name = $1 AND event_id = $2
    `;
    const result = await this._executor(client).query(query, [String(handlerName), String(eventId)]);
    return (result.rowCount || 0) > 0;
  }
}

module.exports = { InboxRepository };