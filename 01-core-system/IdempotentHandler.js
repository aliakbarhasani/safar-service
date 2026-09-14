'use strict';

/**
 * IdempotentHandler.js - Core System (P12)
 *
 * پوشش‌دهنده (Wrapper) هندلرهای رویداد برای تضمین پردازش حداکثر یکبار:
 *   ۱) ادعای رویداد در `inbox_events` (کلید ترکیبی handler_name + event_id)
 *   ۲) اگر تکراری بود → رد شدن کامل (بدون اجرای هندلر)
 *   ۳) اجرای هندلر؛ در صورت خطا ادعا برداشته میشود تا تلاش مجدد ممکن بماند
 *
 * شناسه رویداد از `data.eventId` (افزوده‌شده توسط OutboxRelay) گرفته می‌شود؛
 * اگر نبود، یک شناسه‌ی قطعی از محتوای رویداد ساخته می‌شود (hash) تا رویدادهای
 * In-process تکراری نیز تشخیص داده شوند.
 *
 * Dependency Injection: inboxRepository و eventBus تزریق می‌شوند.
 */

const crypto = require('crypto');

/** شناسه قطعی از نام رویداد + محتوای آن (برای رویدادهای بدون eventId). */
function deterministicEventId(eventName, data) {
  const canonical = stableStringify({ event: eventName, data: data || {} });
  return `sha256:${crypto.createHash('sha256').update(canonical).digest('hex')}`;
}

/** Stringify پایدار (ترتیب کلیدها نرمال‌شده) برای هش قطعی. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

class IdempotentHandler {
  /**
   * @param {Object} deps
   * @param {string} deps.handlerName - نام یکتا برای این هندلر (کلید Inbox)
   * @param {Function} deps.handler - تابع پردازش: (envelope) => Promise<any>
   * @param {{ markProcessed: Function, removeClaim: Function }} deps.inboxRepository
   * @param {Object} [deps.logger]
   */
  constructor({ handlerName, handler, inboxRepository, logger = console } = {}) {
    if (!handlerName) throw new Error('IdempotentHandler requires a handlerName');
    if (typeof handler !== 'function') throw new Error('IdempotentHandler requires a handler function');
    if (!inboxRepository || typeof inboxRepository.markProcessed !== 'function') {
      throw new Error('IdempotentHandler requires an inboxRepository with markProcessed()');
    }
    this.handlerName = handlerName;
    this.handler = handler;
    this.inboxRepository = inboxRepository;
    this.logger = logger || console;
  }

  /**
   * نقطه ورود رویداد (همان امضای هندلرهای معمول: envelope { event, data, timestamp }).
   * @returns {Promise<boolean>} true اگر پردازش شد؛ false اگر تکراری بود
   */
  async handle(envelope = {}) {
    const eventName = envelope.event || 'unknown';
    const data = envelope.data || {};
    const eventId = data.eventId || envelope.eventId || deterministicEventId(eventName, data);

    // ۱) ادعا — اتمیک؛ false یعنی قبلاً توسط همین هندلر پردازش شده است
    const claimed = await this.inboxRepository.markProcessed({
      handlerName: this.handlerName,
      eventId,
      eventType: eventName,
      payload: data,
    });

    if (!claimed) {
      this.logger.warn(`[IdempotentHandler:${this.handlerName}] duplicate ${eventName} (${eventId}) skipped`);
      return false;
    }

    // ۲) اجرا؛ در خطا ادعا برداشته میشود تا رویداد دوباره قابل پردازش باشد
    try {
      await this.handler(envelope);
      return true;
    } catch (error) {
      try {
        await this.inboxRepository.removeClaim({ handlerName: this.handlerName, eventId });
      } catch (cleanupError) {
        this.logger.error(
          `[IdempotentHandler:${this.handlerName}] failed to roll back inbox claim:`,
          cleanupError && cleanupError.message,
        );
      }
      throw error;
    }
  }

  /**
   * ثبت خودکار روی EventBus با پوشش Idempotency.
   * @param {Object} eventBus - ناشر/مشترک (subscribe(event, handler))
   * @param {string} eventName
   * @returns {Function} هندلر پوششداده‌شده
   */
  subscribe(eventBus, eventName) {
    if (!eventBus || typeof eventBus.subscribe !== 'function') {
      throw new Error('IdempotentHandler.subscribe requires an eventBus with subscribe()');
    }
    const wrapped = (envelope) => this.handle(envelope);
    eventBus.subscribe(eventName, wrapped);
    return wrapped;
  }
}

module.exports = IdempotentHandler;
module.exports.IdempotentHandler = IdempotentHandler;
module.exports.deterministicEventId = deterministicEventId;
module.exports.stableStringify = stableStringify;