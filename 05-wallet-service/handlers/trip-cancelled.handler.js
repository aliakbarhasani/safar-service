/**
 * trip-cancelled.handler.js - Wallet Subscriber for trip cancellation events (P2-1 + P7-1)
 *
 * Event-Driven Architecture: Mobility هرگز مستقیماً API کیف پول را صدا نمی‌زند.
 *
 * 1) رویداد کانونی `TripCancelled` (P7-1): اگر `penaltyAmount > 0` باشد،
 *    تراکنش اتمیک جریمه از طریق `walletService.processCancellationPenalty`
 *    اجرا میشود: کسر جریمه از مسافر (با اجازه بدهی) + واریز سهم راننده
 *    (CANCELLATION_COMPENSATION، درصد از Config) + مابقی به پلتفرم.
 *    Idempotency: کلید `trip-penalty:<tripId>`.
 *    اگر penaltyAmount صفر/نامشخص بود و hold ثبت شده بود، به شاخه قدیمی
 *    (آزادسازی hold) میرود.
 *
 * 2) رویدادهای قدیمی (`TripCancelledByPassenger` / `TripCancelledByDriver`):
 *    آزادسازی وجه مسدود (hold) مسافر با `releaseHold` (P1-2).
 *    Idempotency: کلید `trip-cancel:<tripId>`.
 */

const eventBus = require('../../01-core-system/EventBus');

const CANCEL_EVENTS = Object.freeze([
  'TripCancelledByPassenger',
  'TripCancelledByDriver',
]);
const CANONICAL_CANCEL_EVENT = 'TripCancelled';

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

      // ---- P7-1: پردازش جریمه لغو (رویداد کانونی) ----
      const penaltyAmount = Number(data && (data.penaltyAmount ?? data.penalty_amount) || 0);
      if (penaltyAmount > 0) {
        return this._processPenalty({ tripId, passengerId, data, penaltyAmount });
      }

      // ---- مسیر قدیمی: آزادسازی hold (بدون جریمه) ----
      return this._releaseHold({ tripId, passengerId, data, event });
    } catch (err) {
      console.error('[TripCancelledHandler] unexpected error:', err && err.message);
      return { released: false, reason: 'error', message: err && err.message };
    }
  }

  /** جریمه لغو: کسر از مسافر + سهم راننده + مابقی پلتفرم (اتمیک). */
  async _processPenalty({ tripId, passengerId, data, penaltyAmount }) {
    try {
      const result = await this.walletService.processCancellationPenalty({
        tripId,
        passengerId,
        driverId: (data && (data.driverId || data.driver_id)) || null,
        penaltyAmount,
        currencyId: (data && (data.currencyId || data.currency_id)) || 'IRT',
      });
      return {
        penaltyProcessed: true,
        tripId,
        penaltyAmount,
        referenceId: `trip-penalty:${tripId}`,
        driverCompensation: result && result.driverCompensation,
        platformShare: result && result.platformShare,
        debt: result && result.debt,
      };
    } catch (err) {
      // Idempotency: جریمه تکراری همان سفر -> موفق تلقی می‌شود
      if (err && err.message && err.message.includes('Duplicate transaction')) {
        return { penaltyProcessed: true, tripId, penaltyAmount, deduped: true, referenceId: `trip-penalty:${tripId}` };
      }
      console.error(`[TripCancelledHandler] penalty failed for trip ${tripId}:`, err && err.message);
      return { penaltyProcessed: false, reason: 'penalty_failed', tripId, message: err && err.message };
    }
  }

  /** آزادسازی hold مسافر (رویدادهای قدیمی P2-1). */
  async _releaseHold({ tripId, passengerId, data, event }) {
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
  }

  /** ثبت اشتراک در رویدادهای لغو سفر (idempotent در سطح یک instance). */
  register() {
    if (!this._registered) {
      for (const evt of CANCEL_EVENTS) {
        this.eventBus.on(evt, this._boundOnTripCancelled);
      }
      this.eventBus.on(CANONICAL_CANCEL_EVENT, this._boundOnTripCancelled);
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
