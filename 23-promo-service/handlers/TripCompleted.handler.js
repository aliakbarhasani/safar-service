'use strict';

/**
 * TripCompleted.handler.js - Promo Service (P10-2)
 *
 * به رویداد پایان سفر (`TripCompleted`) گوش می‌دهد. اگر سفر از یک کد تخفیف
 * استفاده کرده باشد، ثبت مصرف و افزایش شمارنده در یک تراکنش PostgreSQL انجام می‌شود.
 */
class TripCompletedHandler {
  constructor({ promoCodeModel, promoUsageModel, pool = null, eventBus = null, eventName = 'TripCompleted' }) {
    this.promoCodeModel = promoCodeModel;
    this.promoUsageModel = promoUsageModel;
    this.pool = pool;
    this.eventBus = eventBus;
    this.eventName = eventName;
    this._subscribed = false;
    this._boundOnTripCompleted = (payload) => {
      // EventBus.publishAsync awaits listener return values, allowing OutboxRelay to retry failures.
      const eventData = payload && payload.data && payload.event
        ? payload.data
        : (payload || {});
      return this.handle(eventData).catch((err) => {
        const logger = this.eventBus && this.eventBus.logger;
        if (logger && typeof logger.error === 'function') {
          logger.error('TripCompletedHandler failed', err);
        } else {
          console.warn(`[promo] TripCompletedHandler failed: ${err.message}`);
        }
        return {
          processed: false,
          consumed: false,
          reason: err.code || 'promo_usage_failed',
          message: err.message,
        };
      });
    };
  }

  /**
   * ثبت مصرف کد تخفیف در پایان سفر؛ رویداد تکراری تنها در صورت تطابق کامل
   * با مصرف قبلی پذیرفته می‌شود.
   */
  async handle({ tripId, passengerId, promoCode }) {
    if (!promoCode) return { consumed: false };
    if (!tripId || !passengerId) {
      const error = new Error('TripCompleted payload must include tripId and passengerId');
      error.code = 'PROMO_USAGE_INVALID_PAYLOAD';
      throw error;
    }
    if (!this.pool || typeof this.pool.connect !== 'function') {
      const error = new Error('Promo usage requires a PostgreSQL transaction-capable pool');
      error.code = 'PROMO_USAGE_TRANSACTION_UNAVAILABLE';
      throw error;
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // The unique trip_id index prevents duplicate usage rows. A conflict must
      // be verified, not blindly accepted: a replay with another user/code is corruption.
      const inserted = await client.query(
        'INSERT INTO promo_usages (user_id, promo_code, trip_id) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (trip_id) WHERE trip_id IS NOT NULL DO NOTHING RETURNING id',
        [passengerId, promoCode, tripId]
      );

      if (!inserted.rows || inserted.rows.length === 0) {
        const existing = await client.query(
          'SELECT user_id, promo_code FROM promo_usages WHERE trip_id = $1 FOR UPDATE',
          [tripId]
        );
        const usage = existing.rows && existing.rows[0];
        if (!usage) {
          const error = new Error('Promo usage conflict could not be reconciled');
          error.code = 'PROMO_USAGE_IDEMPOTENCY_STATE_INVALID';
          throw error;
        }
        if (String(usage.user_id) !== String(passengerId) || usage.promo_code !== promoCode) {
          const error = new Error('Trip promo usage already exists with a different user or promo code');
          error.code = 'PROMO_USAGE_IDEMPOTENCY_CONFLICT';
          throw error;
        }
        await client.query('COMMIT');
        return { consumed: false, duplicate: true, tripId, promoCode, userId: passengerId };
      }

      const updated = await client.query(
        'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() ' +
        'WHERE code = $1 RETURNING code',
        [promoCode]
      );
      if (!updated.rows || updated.rows.length === 0) {
        const error = new Error('Promo code disappeared while recording usage');
        error.code = 'PROMO_CODE_NOT_FOUND';
        throw error;
      }

      await client.query('COMMIT');
      return { consumed: true, tripId, promoCode, userId: passengerId };
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
      throw error;
    } finally {
      client.release();
    }
  }

  subscribe() {
    if (!this.eventBus || !this.eventBus.on || this._subscribed) return;
    this.eventBus.on(this.eventName, this._boundOnTripCompleted);
    this._subscribed = true;
  }
}

module.exports = { TripCompletedHandler };
