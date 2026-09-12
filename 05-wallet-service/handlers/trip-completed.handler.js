/**
 * TripCompleted.handler.js - Wallet Subscriber for trip completion events (P5-1)
 *
 * Event-Driven Architecture: Mobility هیچ‌گاه مستقیماً API کیف پول را صدا
 * نمی‌زند. این هندلر به رویداد `TripCompleted` (که توسط `EndTripUseCase`
 * منتشر می‌شود) گوش می‌دهد و پرداخت نهایی سفر را به‌صورت اتمیک انجام می‌دهد:
 *   - کسر `amount` (کرایه نهایی) از کیف پول مسافر (TRIP_PAYMENT)
 *   - کسر کمیسیون سیستم (از Config خوانده می‌شود، نه Hardcode)
 *   - واریز مابقی به کیف پول راننده (TRIP_REVENUE)
 *
 * کمیسیون در این لایه از `config.trip.commissionRates` خوانده می‌شود و به
 * `walletService.processTripPayment` تزریق می‌شود تا سرویس کیف پول هرگز مقدار
 * تراکنش را از بدی/هدر کاربر نپذیرد.
 *
 * Idempotency: `processTripPayment` (داخل خودش) از کلید
 * `trip-payment:<tripId>` استفاده می‌کند؛ انتشار تکراری رویداد باعث دو بار
 * کسر/واریز نمی‌شود.
 */

const config = require('../../14-config-system/server.config');

const TRIP_COMPLETED_EVENT = 'TripCompleted';

class TripCompletedHandler {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] - تزریق EventBus برای تست
   * @param {Object} [opts.walletService] - تزریق wallet.service برای تست
   * @param {number} [opts.commissionRate] - نرخ کمیسیون (درصد)؛ پیش‌فرض از Config
   */
  constructor({ eventBus = null, walletService = null, commissionRate = null } = {}) {
    // eslint-disable-next-line global-require
    this.eventBus = eventBus || require('../../01-core-system/EventBus');
    // eslint-disable-next-line global-require
    this.walletService = walletService || require('../services/wallet.service');
    // کمیسیون از Config خوانده می‌شود (پیش‌فرض ۱۵٪)، هرگز Hardcode در DF.
    this.commissionRate = (commissionRate == null)
      ? parseFloat(((config.trip || {}).commissionRates || {}).general) || 15
      : Number(commissionRate);
    this._registered = false;
    this._boundOnTripCompleted = (envelope) => this.handle(envelope);
  }

  /**
   * نقطه ورود رویداد (Envelope مرکزی: { event, data, timestamp }).
   * خطا هرگز به منتشرکننده (Mobility) برنمی‌گردد (fire-and-forget).
   */
  async handle({ event, data } = {}) {
    try {
      const tripId = data && (data.tripId || data.trip_id);
      const passengerId = data && (data.passengerId || data.passenger_id);
      const driverId = data && (data.driverId || data.driver_id);
      const amount = data && (data.amount ?? data.finalFare ?? data.finalCost);
      const currencyId = (data && (data.currency || data.currencyId || data.currency_id)) || 'IRT';

      if (!tripId || !passengerId || !driverId || amount == null || Number(amount) <= 0) {
        return { processed: false, reason: 'missing_settlement_fields', event: event || null };
      }

      try {
        const result = await this.walletService.processTripPayment({
          tripId,
          passengerId,
          driverId,
          amount: Number(amount),
          currencyId,
          commissionRate: this.commissionRate,
        });
        return {
          processed: true,
          tripId,
          amount: Number(amount),
          commission: result && result.commission,
          driverAmount: result && result.driverAmount,
          debt: !!(result && result.debt),
          referenceId: result && result.referenceId,
          transactionIds: {
            passenger: result && result.passengerTransactionId,
            driver: result && result.driverTransactionId,
            platform: result && result.platformCommissionId,
          },
        };
      } catch (err) {
        // Idempotency: پرداخت تکراری همان سفر -> موفق تلقی می‌شود
        if (err && err.message && err.message.includes('Duplicate transaction')) {
          return { processed: true, tripId, referenceId: `trip-payment:${tripId}`, deduped: true };
        }
        console.error(`[TripCompletedHandler] processTripPayment failed for trip ${tripId}:`, err && err.message);
        return { processed: false, reason: 'payment_failed', tripId, message: err && err.message };
      }
    } catch (err) {
      console.error('[TripCompletedHandler] unexpected error:', err && err.message);
      return { processed: false, reason: 'error', message: err && err.message };
    }
  }

  /** ثبت اشتراک در رویداد تکمیل سفر (idempotent در سطح یک instance). */
  register() {
    if (!this._registered) {
      this.eventBus.on(TRIP_COMPLETED_EVENT, this._boundOnTripCompleted);
      this._registered = true;
    }
    return this;
  }

  /** لغو اشتراک (برای تمیز کردن test). */
  unregister() {
    if (this._registered) {
      this.eventBus.off(TRIP_COMPLETED_EVENT, this._boundOnTripCompleted);
      this._registered = false;
    }
    return this;
  }
}

/** Bootstrap: ساخت هندلر و ثبت اشتراک. */
function registerTripCompletedHandler(opts = {}) {
  return new TripCompletedHandler(opts).register();
}

module.exports = { TripCompletedHandler, registerTripCompletedHandler, TRIP_COMPLETED_EVENT };