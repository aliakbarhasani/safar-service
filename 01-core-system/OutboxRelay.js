'use strict';

/**
 * OutboxRelay.js - Core System (P12)
 *
 * Worker سبک برای الگوی Transactional Outbox:
 *   ۱) واکشی دسته‌ای رکوردهای PENDING از `outbox_events`
 *   ۲) انتشار هر رویداد روی EventBus مرکزی (Envelope استاندارد)
 *   ۳) علامت‌گذاری PUBLISHED؛ در صورت خطا `markFailed` + backoff نمایی
 *
 * تضمین: هیچ رویدادی گم نمی‌شود حتی اگر انتشار بلافاصله پس از COMMIT شکست بخورد
 * (At-least-once). مصرف‌کنندهها به‌کمک Inbox آن را به Exactly-once تبدیل می‌کنند.
 *
 * Dependency Injection: تمام وابستگی‌ها تزریق می‌شوند (تست‌پذیر با Mock).
 */

const DEFAULT_INTERVAL_MS = 1000;
const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_RETRIES = 5;

// کلیدهای رزرو‌شدهای که Relay به payload اضافه می‌کند تا مصرف‌کنندهها
// بتوانند با Inbox روی همان `eventId` جلوی پردازش تکراری را بگیرند.
const EVENT_ID_KEY = 'eventId';
const AGGREGATE_ID_KEY = 'aggregateId';

class OutboxRelay {
  /**
   * @param {Object} deps
   * @param {{ fetchPending: Function, markPublished: Function, markFailed: Function }} deps.outboxRepository
   * @param {Object} [deps.eventBus] - EventBus مرکزی (publish(event, data))
   * @param {number} [deps.intervalMs] - فاصله بین تیک‌ها (میلی‌ثانیه)
   * @param {number} [deps.batchSize] - اندازه دسته در هر تیک
   * @param {number} [deps.maxRetries] - حداکثر تلاش مجدد پیش از park کردن رکورد
   * @param {Object} [deps.logger]
   */
  constructor({
    outboxRepository,
    eventBus = null,
    intervalMs = DEFAULT_INTERVAL_MS,
    batchSize = DEFAULT_BATCH_SIZE,
    maxRetries = DEFAULT_MAX_RETRIES,
    logger = console,
  } = {}) {
    if (!outboxRepository || typeof outboxRepository.fetchPending !== 'function') {
      throw new Error('OutboxRelay requires an outboxRepository with fetchPending()');
    }
    this.outboxRepository = outboxRepository;
    // require تنبل تا در تست‌ها بتوان EventBus جعلی تزریق کرد
    // eslint-disable-next-line global-require
    this.eventBus = eventBus || require('./EventBus');
    this.intervalMs = intervalMs;
    this.batchSize = batchSize;
    this.maxRetries = maxRetries;
    this.logger = logger || console;
    this._timer = null;
    this._running = false;
    this.stats = { published: 0, failed: 0, ticks: 0 };
  }

  /** فعال‌سازی worker دوره‌ای. */
  start() {
    if (this._timer) return this;
    // unref: تایمر مانع خروج طبیعی پروسه (و بسته‌شدن Jest) نمی‌شود
    this._timer = setInterval(() => { this._tick(); }, this.intervalMs);
    if (typeof this._timer.unref === 'function') this._timer.unref();
    this._tick();
    return this;
  }

  /** توقف worker. */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  /** @private یک تیک: واکشی + انتشار (بدون اجرای همزمان دو تیک) */
  async _tick() {
    if (this._running) return 0;
    this._running = true;
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.error('[OutboxRelay] tick failed:', error && error.message);
      return 0;
    } finally {
      this._running = false;
    }
  }

  /**
   * یک دور کامل پردازش (قابل فراخوانی مستقیم در تست).
   * @returns {Promise<number>} تعداد رویدادهای منتشرشده
   */
  async runOnce() {
    const rows = await this.outboxRepository.fetchPending({ limit: this.batchSize });
    if (!rows || rows.length === 0) return 0;

    this.stats.ticks += 1;
    let published = 0;

    for (const row of rows) {
      try {
        await this._publish(row);
        await this.outboxRepository.markPublished(row.id);
        this.stats.published += 1;
        published += 1;
      } catch (error) {
        this.stats.failed += 1;
        this.logger.error(
          `[OutboxRelay] publish failed for ${row.event_type} (${row.id}):`,
          error && error.message,
        );
        // A database failure while recording the retry must not abort the
        // remaining rows in this batch. The PROCESSING lease recovery in the
        // repository will make this event eligible again after five minutes.
        try {
          await this.outboxRepository.markFailed(row.id, error, { maxRetries: this.maxRetries });
        } catch (markFailedError) {
          this.logger.error(
            `[OutboxRelay] could not record failure for ${row.id}:`,
            markFailedError && markFailedError.message,
          );
        }
      }
    }

    return published;
  }

  /**
   * انتشار یک ردیف Outbox روی EventBus.
   * payload ذخیره‌شده + کلیدهای رزرو‌شده (eventId/aggregateId) به مصرف‌کننده می‌رسد
   * تا Inbox بتواند تکراری‌ها را تشخیص دهد.
   * @private
   */
  async _publish(row) {
    const payload = (row.payload && typeof row.payload === 'object') ? row.payload : {};
    const data = {
      ...payload,
      [EVENT_ID_KEY]: row.id,
      [AGGREGATE_ID_KEY]: row.aggregate_id,
    };

    if (typeof this.eventBus.publishAsync !== 'function') {
      this.eventBus.publish(row.event_type, data);
      return;
    }

    const results = await this.eventBus.publishAsync(row.event_type, data);
    // Financial events are marked PUBLISHED only after their async consumers
    // report success. Otherwise runOnce records a failure and schedules retry.
    const failed = (results || []).find((result) => {
      if (!result || typeof result !== 'object') return false;
      if (row.event_type === 'TripCompleted') return result.processed === false;
      if (row.event_type === 'TripCreated') return result.dispatchFailed === true;
      if (row.event_type === 'TripCancelled') {
        return result.penaltyProcessed === false
          || (result.released === false && result.reason !== 'no_held_amount');
      }
      return false;
    });
    if (failed) {
      throw new Error(`Consumer failed for ${row.event_type}: ${failed.reason || failed.message || 'processing failed'}`);
    }
  }
}

module.exports = OutboxRelay;
module.exports.OutboxRelay = OutboxRelay;
module.exports.EVENT_ID_KEY = EVENT_ID_KEY;
module.exports.AGGREGATE_ID_KEY = AGGREGATE_ID_KEY;