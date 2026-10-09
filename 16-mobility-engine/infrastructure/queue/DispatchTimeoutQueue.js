/**
 * DispatchTimeoutQueue.js - BullMQ-based delayed timeout queue (P3-4)
 *
 * صف تاخیری تایم‌اوت تخصیص سفر:
 *   - پس از پیشنهاد سفر به راننده، یک Job با تاخیر ۱۵ ثانیه در صف قرار می‌گیرد.
 *   - Worker پس از گذشت زمان، `tripDispatchService.handleDispatchTimeout` را فراخوانی می‌کند.
 *   - اگر راننده قبل از تایم‌اوت سفر را قبول کند، کلید Redis حذف شده و
 *     Worker هنگام اجرا `ALREADY_RESOLVED` برمی‌گرداند.
 *
 * Dependency Injection: تمام وابستگی‌ها تزریق می‌شوند (Clean Architecture).
 * در صورت عدم نصب `bullmq`، ماژول fallback no-op ارائه می‌دهد.
 */

let Queue = null;
let Worker = null;
try {
  // eslint-disable-next-line global-require
  const bullmq = require('bullmq');
  Queue = bullmq.Queue;
  Worker = bullmq.Worker;
} catch (e) {
  // bullmq not installed — use no-op stubs
  Queue = null;
  Worker = null;
}

const DEFAULT_QUEUE_NAME = 'dispatch-timeout-queue';
const DEFAULT_TIMEOUT_MS = 15000;

class DispatchTimeoutQueue {
  /**
   * @param {Object} deps
   * @param {Object} deps.redisConnection - اتصال Redis مشترک با BullMQ
   * @param {Object} [deps.tripDispatchService] - سرویس تخصیص (برای Worker)
   * @param {string} [deps.queueName] - نام صف
   * @param {number} [deps.timeoutMs] - تاخیر پیش‌فرض (میلی‌ثانیه)
   */
  constructor({
    redisConnection = null,
    tripDispatchService = null,
    queueName = DEFAULT_QUEUE_NAME,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    this.queueName = queueName;
    this.timeoutMs = timeoutMs;
    this.tripDispatchService = tripDispatchService;
    this._queue = null;
    this._worker = null;
    this._fallbackTimers = new Map();

    if (Queue && redisConnection) {
      this._queue = new Queue(queueName, { connection: redisConnection });
    }
  }

  /**
   * افزودن Job تایم‌اوت برای سفر.
   * @param {string} tripId - شناسه سفر
   * @param {number} [delayMs] - تاخیر بر حسب میلی‌ثانیه (پیش‌فرض: ۱۵۰۰۰)
   * @returns {Promise<void>}
   */
  async scheduleTimeout(tripId, delayMs = this.timeoutMs) {
    if (!this._queue) {
      // Functional local fallback when BullMQ is not installed. The Redis
      // dispatch key and database status are rechecked by handleDispatchTimeout.
      // This fallback is process-local; production should use BullMQ for durable jobs.
      if (!this.tripDispatchService || typeof this.tripDispatchService.handleDispatchTimeout !== 'function') {
        return;
      }
      const previous = this._fallbackTimers.get(String(tripId));
      if (previous) clearTimeout(previous);
      const timer = setTimeout(async () => {
        this._fallbackTimers.delete(String(tripId));
        try {
          await this.tripDispatchService.handleDispatchTimeout(tripId);
        } catch (error) {
          console.error(`[DispatchTimeoutQueue] timeout failed for trip ${tripId}:`, error.message);
        }
      }, Math.max(0, Number(delayMs) || this.timeoutMs));
      if (typeof timer.unref === 'function') timer.unref();
      this._fallbackTimers.set(String(tripId), timer);
      return;
    }
    await this._queue.add(
      'dispatch-timeout',
      { tripId },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: true,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  /**
   * راه‌اندازی Worker برای پردازش تایم‌اوت‌ها.
   * @returns {Promise<void>}
   */
  async startWorker() {
    if (!Worker || !this.tripDispatchService) {
      return;
    }
    this._worker = new Worker(
      this.queueName,
      async (job) => {
        const tripId = job.data && job.data.tripId;
        if (!tripId) {
          return { status: 'INVALID_JOB' };
        }
        return this.tripDispatchService.handleDispatchTimeout(tripId);
      },
      { connection: this._queue.opts.connection, concurrency: 5 },
    );
    return this._worker.waitUntilReady();
  }

  /**
   * توقف Worker و بستن صف.
   * @returns {Promise<void>}
   */
  async close() {
    for (const timer of this._fallbackTimers.values()) clearTimeout(timer);
    this._fallbackTimers.clear();
    if (this._worker) {
      await this._worker.close();
      this._worker = null;
    }
    if (this._queue) {
      await this._queue.close();
      this._queue = null;
    }
  }
}

module.exports = { DispatchTimeoutQueue, DEFAULT_QUEUE_NAME, DEFAULT_TIMEOUT_MS };
