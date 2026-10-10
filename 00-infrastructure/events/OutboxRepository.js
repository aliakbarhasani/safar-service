'use strict';

/**
 * OutboxRepository.js - Infrastructure (P12)
 *
 * لایه دسترسی داده برای «Transactional Outbox»:
 *   - `insert(...)`        : ثبت رویداد در همان تراکنشِ تغییر وضعیت دامنه
 *                            (پذیرش یک `client` تراکنشی تا COMMIT/ROLLBACK با دامنه یکی باشد)
 *   - `fetchPending(...)`  : واکشی دسته‌ای رکوردهای PENDING برای Relay
 *   - `markPublished(...)` : پس از انتشار موفق روی EventBus
 *   - `markFailed(...)`    : ثبت خطا + backoff نمایی برای تلاش مجدد
 *   - `prunePublished(...)`: پاک‌سازی رکوردهای منتشرشده قدیمی
 *
 * قرارداد دسترسی: هر متد یک `client` اختیاری می‌پذیرد؛ اگر داده شود از آن
 * (تراکنش در جریان) و در غیر این صورت از `pool` استفاده می‌شود.
 */

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;
const BASE_RETRY_DELAY_SECONDS = 2;

const OUTBOX_STATUS = Object.freeze({
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
});

class OutboxRepository {
  /**
   * @param {Object} deps
   * @param {import('pg').Pool} deps.pool - استخر اتصال PostgreSQL
   */
  constructor({ pool = null } = {}) {
    if (!pool) throw new Error('OutboxRepository requires a pg pool');
    this.pool = pool;
  }

  /** @private انتخاب executor: کلاینت تراکنشی یا استخر */
  _executor(client = null) {
    return client || this.pool;
  }

  /**
   * ثبت رویداد در outbox — باید داخل تراکنش دامنه فراخوانی شود.
   * @param {Object} event
   * @param {string} event.aggregateId - شناسه Aggregate (مثلاً tripId)
   * @param {string} event.eventType - نام رویداد (مثلاً TripAccepted)
   * @param {Object} [event.payload] - داده‌ی رویداد (JSONB)
   * @param {import('pg').PoolClient} [client] - کلاینت تراکنش در جریان
   * @returns {Promise<Object>} ردیف درج‌شده
   */
  async insert({ aggregateId, eventType, payload = {} } = {}, client = null) {
    if (!aggregateId || !eventType) {
      const error = new Error('OutboxRepository.insert: aggregateId و eventType الزامی هستند.');
      error.code = 'OUTBOX_INSERT_VALIDATION';
      throw error;
    }

    const query = `
      INSERT INTO outbox_events (aggregate_id, event_type, payload, status)
      VALUES ($1, $2, $3::jsonb, $4)
      RETURNING id, aggregate_id, event_type, payload, status, retry_count, created_at
    `;
    const { rows } = await this._executor(client).query(query, [
      String(aggregateId),
      String(eventType),
      JSON.stringify(payload || {}),
      OUTBOX_STATUS.PENDING,
    ]);
    return rows[0];
  }

  /**
   * واکشی رویدادهای آماده انتشار (PENDING و available_at گذشته).
   * @param {Object} [opts]
   * @param {number} [opts.limit]
   * @returns {Promise<Array<Object>>}
   */
  async fetchPending({ limit = DEFAULT_BATCH_SIZE } = {}) {
    const size = Number(limit);
    if (!Number.isInteger(size) || size <= 0) {
      const error = new Error('OutboxRepository.fetchPending: limit باید عدد صحیح مثبت باشد.');
      error.code = 'OUTBOX_FETCH_VALIDATION';
      throw error;
    }

    // Recover claims abandoned by a crashed worker. A five-minute lease prevents
    // PROCESSING rows from becoming permanently invisible after a process restart.
    await this.pool.query(`
      UPDATE outbox_events
      SET status = $1, available_at = NOW(), updated_at = NOW()
      WHERE status = $2 AND updated_at < NOW() - INTERVAL '5 minutes'
    `, [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.PROCESSING]);

    // Claim rows atomically. FOR UPDATE SKIP LOCKED prevents two app instances
    // from processing the same pending event at the same time.
    const query = `
      WITH candidates AS (
        SELECT id
        FROM outbox_events
        WHERE status = $1 AND available_at <= NOW()
        ORDER BY available_at ASC, created_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE outbox_events AS events
      SET status = $3, updated_at = NOW()
      FROM candidates
      WHERE events.id = candidates.id
      RETURNING events.id, events.aggregate_id, events.event_type, events.payload,
                events.status, events.retry_count, events.created_at
    `;
    const { rows } = await this.pool.query(query, [
      OUTBOX_STATUS.PENDING,
      size,
      OUTBOX_STATUS.PROCESSING,
    ]);
    return rows;
  }

  /** علامت‌گذاری رویداد به‌عنوان منتشرشده. */
  async markPublished(eventId, client = null) {
    if (!eventId) throw new Error('OutboxRepository.markPublished: eventId الزامی است.');
    const query = `
      UPDATE outbox_events
      SET status = $2, published_at = NOW(), updated_at = NOW(), last_error = NULL
      WHERE id = $1
      RETURNING id, status
    `;
    const { rows } = await this._executor(client).query(query, [eventId, OUTBOX_STATUS.PUBLISHED]);
    return rows[0] || null;
  }

  /**
   * ثبت خطای انتشار + زمان‌بندی تلاش مجدد (backoff نمایی).
   * پس از عبور از `maxRetries` وضعیت FAILED (park) می‌شود تا بی‌نهایت تلاش نکند.
   */
  async markFailed(eventId, error, { maxRetries = DEFAULT_MAX_RETRIES } = {}) {
    if (!eventId) throw new Error('OutboxRepository.markFailed: eventId الزامی است.');
    const message = error && error.message ? error.message : String(error || 'unknown error');

    const query = `
      UPDATE outbox_events
      SET retry_count = retry_count + 1,
          last_error = $2,
          status = CASE WHEN retry_count + 1 >= $3 THEN $4 ELSE $1 END,
          available_at = NOW() + (POWER($5::numeric, retry_count + 1) * INTERVAL '1 second'),
          updated_at = NOW()
      WHERE id = $6
      RETURNING id, status, retry_count, available_at
    `;
    const { rows } = await this.pool.query(query, [
      OUTBOX_STATUS.PENDING,
      String(message).substring(0, 2000),
      maxRetries,
      OUTBOX_STATUS.FAILED,
      BASE_RETRY_DELAY_SECONDS,
      eventId,
    ]);
    return rows[0] || null;
  }

  /** پاک‌سازی رویدادهای منتشرشده قدیمی (نگهداشت داده). */
  async prunePublished({ olderThanHours = 24 } = {}) {
    const hours = Number(olderThanHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new Error('OutboxRepository.prunePublished: olderThanHours باید عددی مثبت باشد.');
    }
    const query = `
      DELETE FROM outbox_events
      WHERE status = $1 AND published_at < NOW() - ($2::numeric * INTERVAL '1 hour')
    `;
    const result = await this.pool.query(query, [OUTBOX_STATUS.PUBLISHED, hours]);
    return result.rowCount || 0;
  }
}

module.exports = { OutboxRepository, OUTBOX_STATUS, DEFAULT_BATCH_SIZE, DEFAULT_MAX_RETRIES };