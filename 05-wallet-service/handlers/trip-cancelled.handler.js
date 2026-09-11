/**
 * trip-cancelled.handler.js - Wallet Subscriber for trip cancellation events (P2-1)
 *
 * Event-Driven Architecture: Mobility هرگز مستقیماً API کیف پول را صدا نمی‌زند.
 * این هندلر به رویدادهای لغو سفر (`TripCancelledByPassenger` /
 * `TripCancelledByDriver`) گوش می‌دهد و به‌صورت خودکار وجه مسدود (hold)
 * مسافر را از طریق متد اتمیک `releaseHold` (ساخته‌شده در P1-2) آزاد می‌کند.
 *
 * Idempotency: کلید `trip-cancel:<tripId>` به‌عنوان referenceId استفاده می‌شود
 * تا انتشار تکراری رویداد باعث آزادسازی دوباره نشود (releaseHold در صورت
 * تکراری بودن referenceId خطا می‌دهد که در اینجا به‌آرامی نادیده گرفته می‌شود).
 */

const eventBus = require('../../01-core-system/EventBus');

const CANCEL_EVENTS = Object.freeze([
  'TripCancelledByPassenger',
  'TripCancelledByDriver',
]);

class TripCancelledHandler {
  /**
   * @param {Object} [opts]
   * @param {Object} [opts.eventBus] - تزریق EventBus برای تست
   * @param {Object} [opts.walletService] - تزریق wallet.service برای تست
   */
  constructor({ eventBus: injectedBus = null, walletService = null } = {}) {
    // eslint-disable-next-line global-require
    this.eventBus = injectedBus || eventBus || require('../../01-core-system/EventBus');
    // eslint-disable-next-line global-require
    this.walletService = walletService || require('../services/wallet.service');
    this._registered = false;
    this._boundOnTripCancelled = (envelope) => this.handle(envelope);
  }

  /**
   * نقطه ورود رویداد (Envelope مرکزی: { event, data, timestamp }).
   * خطا هرگز به منتشرکننده (Mobility) برنمی‌گردد (fire-and-forget).
   */
  async handle({ event, data } = {}) {
    try {
      const tripId = data && (data.tripId || data.trip_id);
      const passengerId = data && (data.passengerId || data.passenger_id || data.userId);
      if (!tripId || !passengerId) {
        return { released: false, reason: 'missing_trip_or_passenger', event: event || null };
      }

      const amount = data && (data.heldAmount ?? data.amount ?? data.estimatedCost);
      const currencyId = (data && (data.currencyId || data.currency_id)) || 'IRT';
      const referenceId = `trip-cancel:${tripId}`;

      // مبلغ نامشخص (مثلاً سفر بدون hold) -> چیزی برای آزادسازی نیست
      if (amount == null || Number(amount) <= 0) {
        return { released: false, reason: 'no_held_amount', tripId, referenceId };
      }

      try {
        const result = await this.walletService.releaseHold({
          userId: passengerId,
          amount: Number(amount),
          referenceType: 'trip_cancel',
          referenceId,
          reason: `Trip ${tripId} cancelled (${event || 'unknown'}) — hold released`,
          currencyId,
        });
        return { released: true, tripId, referenceId, transactionId: result && result.transactionId };
      } catch (err) {
        // Idempotency: آزادسازی تکراری همان سفر -> موفق تلقی می‌شود
        if (err && err.message && err.message.includes('Duplicate transaction')) {
          return { released: true, tripId, referenceId, deduped: true };
        }
        console.error(`[TripCancelledHandler] releaseHold failed for trip ${tripId}:`, err && err.message);
        return { released: false, reason: 'release_failed', tripId, message: err && err.message };
      }
    } catch (err) {
      console.error('[TripCancelledHandler] unexpected error:', err && err.message);
      return { released: false, reason: 'error', message: err && err.message };
    }
  }

  /** ثبت اشتراک در رویدادهای لغو سفر (idempotent در سطح یک instance). */
  register() {
    if (!this._registered) {
      for (const evt of CANCEL_EVENTS) {
        this.eventBus.on(evt, this._boundOnTripCancelled);
      }
      this._registered = true;
    }
    return this;
  }
}

/** Bootstrap: ساخت هندلر و ثبت اشتراک. */
function registerTripCancelledHandler(opts = {}) {
  return new TripCancelledHandler(opts).register();
}

module.exports = { TripCancelledHandler, registerTripCancelledHandler, CANCEL_EVENTS };
