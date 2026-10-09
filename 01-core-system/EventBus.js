/**
 * EventBus.js - هسته مرکزی رویدادمحور (Pub/Sub)
 * 
 * طبق بند ۸ سند مادر: رویدادها قلب سیستم هستند
 * این ماژول با استفاده از EventEmitter نود جی‌اس،
 * ارتباط بدون وابستگی مستقیم (Decoupled) بین ماژول‌ها را فراهم می‌کند.
 * 
 * رویدادهای استاندارد سیستم:
 * - TripCreated
 * - TripFinished
 * - PaymentCompleted
 * - WalletCharged
 * - AdPublished
 * - UserRegistered
 * - UserVerified
 */

const EventEmitter = require('events');
const { requestContext } = require('../00-infrastructure/logger/context');

class EventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // افزایش ظرفیت برای ماژول‌های متعدد
  }

  /**
   * انتشار یک رویداد در سیستم
   * @param {string} event - نام رویداد
   * @param {*} data - داده‌های مرتبط با رویداد
   */
  publish(event, data) {
    const store = requestContext.getStore();
    const correlationId = store?.correlationId || null;
    this.emit(event, {
      event,
      data,
      timestamp: new Date().toISOString(),
      metadata: { correlationId },
    });
  }

  /**
   * انتشار و انتظار برای تکمیل listenerهای async.
   * OutboxRelay از این متد استفاده می‌کند تا شکست پردازشگرهای مالی
   * قبل از علامت‌گذاری رویداد به‌عنوان PUBLISHED قابل تشخیص باشد.
   */
  async publishAsync(event, data) {
    const store = requestContext.getStore();
    const correlationId = store?.correlationId || null;
    const envelope = {
      event,
      data,
      timestamp: new Date().toISOString(),
      metadata: { correlationId },
    };
    const listeners = this.rawListeners(event);
    return Promise.all(listeners.map((listener) => listener(envelope)));
  }

  /**
   * اشتراک در یک رویداد
   * @param {string} event - نام رویداد
   * @param {Function} handler - تابع پردازشگر
   */
  subscribe(event, handler) {
    this.on(event, handler);
  }

  /**
   * لغو اشتراک از یک رویداد
   * @param {string} event - نام رویداد
   * @param {Function} handler - تابع پردازشگر
   */
  unsubscribe(event, handler) {
    this.off(event, handler);
  }

  /**
   * اشتراک یکبار مصرف (فقط یک بار اجرا می‌شود)
   * @param {string} event - نام رویداد
   * @param {Function} handler - تابع پردازشگر
   */
  subscribeOnce(event, handler) {
    this.once(event, handler);
  }

  /**
   * دریافت تعداد شنوندگان یک رویداد
   * @param {string} event - نام رویداد
   * @returns {number}
   */
  listenerCount(event) {
    return super.listenerCount(event);
  }
}

// ایجاد یک نمونه Singleton از EventBus برای کل سیستم
const eventBus = new EventBus();

module.exports = eventBus;