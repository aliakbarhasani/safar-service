/**
 * MobilityEventHandler.js - اتصال رویدادهای دامنه Mobility به سرویس‌های مرتبط (P3-3)
 *
 * این هندلر رویداد `TripRequested` (که از CreateTripUseCase منتشر می‌شود) را به
 * `TripDispatchService.dispatchTrip` متصل می‌کند تا پس از ایجاد سفر، فرآیند تخصیص
 * هوشمند راننده به‌صورت خودکار آغاز شود.
 *
 * همچنین رویدادهای `TripProposedToDriver` و `TripDispatchTimeout` را برای
 * مانیتورینگ/لاگ‌گیری در صورت نیاز در دسترس قرار می‌دهد.
 */

const TripDomainEvents = require('../domain/events/TripDomainEvents');

class MobilityEventHandler {
  /**
   * @param {Object} deps
   * @param {Object} deps.eventBus - EventBus مرکزی
   * @param {Object} deps.tripDispatchService - سرویس تخصیص هوشمند
   * @param {Object} [deps.logger] - لاگر (اختیاری)
   */
  constructor({ eventBus, tripDispatchService, logger = null } = {}) {
    if (!eventBus) throw new Error('MobilityEventHandler: eventBus is required');
    if (!tripDispatchService) throw new Error('MobilityEventHandler: tripDispatchService is required');

    this.eventBus = eventBus;
    this.tripDispatchService = tripDispatchService;
    this.logger = logger;
    this._registered = false;
    this._boundOnTripRequested = (envelope) => this._handleTripRequested(envelope);
  }

  /**
   * ثبت اشتراک در رویداد TripRequested (idempotent در سطح یک instance).
   */
  register() {
    if (!this._registered) {
      this.eventBus.on(TripDomainEvents.TripCreated, this._boundOnTripRequested);
      this._registered = true;
      this._log('MobilityEventHandler registered for TripCreated');
    }
    return this;
  }

  /**
   * حذف اشتراک (برای cleanup در تست‌ها).
   */
  unregister() {
    if (this._registered) {
      this.eventBus.off(TripDomainEvents.TripCreated, this._boundOnTripRequested);
      this._registered = false;
    }
    return this;
  }

  /**
   * پردازش رویداد TripCreated: فراخوانی dispatchTrip با مختصات مبدأ سفر.
   * @param {Object} envelope - Envelope مرکزی: { event, data, timestamp }
   */
  async _handleTripRequested({ data } = {}) {
    try {
      const tripId = data && (data.tripId || data.trip_id);
      const origin = data && (data.origin || data.origin_address);

      if (!tripId || !origin || origin.lng == null || origin.lat == null) {
        this._log('TripCreated event missing tripId or origin coordinates, skipping dispatch');
        return { dispatchFailed: true, reason: 'missing_trip_or_origin_coordinates' };
      }

      this._log(`Dispatching trip ${tripId} at (${origin.lng}, ${origin.lat})`);
      const result = await this.tripDispatchService.dispatchTrip(tripId, origin.lng, origin.lat);
      this._log(`Dispatch result for trip ${tripId}: ${result.status}`);
      return result;
    } catch (err) {
      this._log(`Error handling TripCreated event: ${err.message}`);
      return { dispatchFailed: true, reason: err.code || err.message || 'dispatch_failed' };
    }
  }

  _log(message) {
    if (this.logger && typeof this.logger.info === 'function') {
      this.logger.info(message);
    }
  }
}

/**
 * Bootstrap: ساخت هندلر و ثبت اشتراک.
 */
function registerMobilityEventHandler(opts = {}) {
  return new MobilityEventHandler(opts).register();
}

module.exports = { MobilityEventHandler, registerMobilityEventHandler };
