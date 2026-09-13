/**
 * TripCancelled.handler.js - Driver Service Subscriber (P7-1, مرحله ۴)
 *
 * با لغو سفر، راننده درگیر سفر باید بلافاصله به وضعیت آزاد (online) برگردد
 * تا مجدداً در Dispatch (P3-3) و جستجوی نزدیک‌ترین‌ها (P3-1) ظاهر شود.
 *
 * Event-Driven: Mobility هرگز مستقیماً سرویس Driver را صدا نمی‌زند.
 * خطا هرگز به منتشرکننده برنمی‌گردد (fire-and-forget).
 */

const eventBus = require('../../01-core-system/EventBus');

const CANONICAL_CANCEL_EVENT = 'TripCancelled';

class DriverReleaseHandler {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] - تزریق EventBus برای تست
   * @param {Object} [opts.driverService] - تزریق سرویس راننده برای تست
   */
  constructor({ eventBus: injectedBus = null, driverService = null } = {}) {
    this.eventBus = injectedBus || eventBus;
    // eslint-disable-next-line global-require
    this.driverService = driverService || require('../services/driver.service');
    this._registered = false;
    this._boundHandler = (envelope) => this.handle(envelope);
  }

  /**
   * نقطه ورود رویداد (Envelope مرکزی: { event, data, timestamp }).
   * @returns {Promise<Object>} نتیجه آزادسازی (برای تست/مانیتورینگ)
   */
  async handle({ data } = {}) {
    try {
      const driverId = data && (data.driverId || data.driver_id);
      if (!driverId) {
        return { released: false, reason: 'no_driver_on_trip' };
      }
      // «آزاد» در سرویس راننده = operationalStatus 'online' (قابل dispatch مجدد)
      const result = await this.driverService.updateOperationalStatus(driverId, 'online');
      if (result && result.error) {
        console.error(`[DriverReleaseHandler] failed for driver ${driverId}:`, result.error);
        return { released: false, reason: 'service_error', message: result.error };
      }
      return { released: true, driverId, operationalStatus: 'online' };
    } catch (err) {
      console.error('[DriverReleaseHandler] unexpected error:', err && err.message);
      return { released: false, reason: 'error', message: err && err.message };
    }
  }

  /** ثبت اشتراک رویداد (idempotent در سطح یک instance). */
  register() {
    if (!this._registered) {
      this.eventBus.on(CANONICAL_CANCEL_EVENT, this._boundHandler);
      this._registered = true;
    }
    return this;
  }
}

/** Bootstrap: ساخت هندلر و ثبت اشتراک. */
function registerDriverReleaseHandler(opts = {}) {
  return new DriverReleaseHandler(opts).register();
}

module.exports = { DriverReleaseHandler, registerDriverReleaseHandler, CANONICAL_CANCEL_EVENT };