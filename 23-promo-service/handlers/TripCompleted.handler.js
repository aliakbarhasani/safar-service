'use strict';

/**
 * TripCompleted.handler.js - Promo Service (P10-2)
 *
 * Consumes a promo only after a completed trip. PostgreSQL row locking keeps
 * global and per-user limits correct under concurrent completion events.
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

  _error(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  /**
   * Records promo use exactly once per trip. Replays are accepted only when
   * their user and code match the original usage. Any failed limit check rolls
   * back the usage insert and counter update together.
   */
  async handle({ tripId, passengerId, promoCode }) {
    if (!promoCode) return { consumed: false };
    if (!tripId || !passengerId) {
      throw this._error('TripCompleted payload must include tripId and passengerId', 'PROMO_USAGE_INVALID_PAYLOAD');
    }
    if (!this.pool || typeof this.pool.connect !== 'function') {
      throw this._error('Promo usage requires a PostgreSQL transaction-capable pool', 'PROMO_USAGE_TRANSACTION_UNAVAILABLE');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Fast path for normal event replays. Concurrent first deliveries are
      // still protected by the unique trip_id index and conflict reconciliation below.
      const prior = await client.query(
        'SELECT user_id, promo_code FROM promo_usages WHERE trip_id = $1 FOR UPDATE',
        [tripId]
      );
      const previousUsage = prior.rows && prior.rows[0];
      if (previousUsage) {
        if (String(previousUsage.user_id) !== String(passengerId) || previousUsage.promo_code !== promoCode) {
          throw this._error('Trip promo usage already exists with a different user or promo code', 'PROMO_USAGE_IDEMPOTENCY_CONFLICT');
        }
        await client.query('COMMIT');
        return { consumed: false, duplicate: true, tripId, promoCode, userId: passengerId };
      }

      // Serialize all usage of this promo code before checking shared limits.
      const promoResult = await client.query(
        'SELECT code, is_active, expires_at, max_uses_per_user, global_max_uses, current_uses ' +
        'FROM promo_codes WHERE code = $1 FOR UPDATE',
        [promoCode]
      );
      const promo = promoResult.rows && promoResult.rows[0];
      if (!promo) throw this._error('Promo code was not found while recording usage', 'PROMO_CODE_NOT_FOUND');

      // A concurrent delivery for the same trip may have committed while this
      // transaction waited for the promo row lock. Re-check before limits so a
      // legitimate duplicate is not misclassified as a user/global limit error.
      const afterLock = await client.query(
        'SELECT user_id, promo_code FROM promo_usages WHERE trip_id = $1 FOR UPDATE',
        [tripId]
      );
      const committedUsage = afterLock.rows && afterLock.rows[0];
      if (committedUsage) {
        if (String(committedUsage.user_id) !== String(passengerId) || committedUsage.promo_code !== promoCode) {
          throw this._error('Trip promo usage already exists with a different user or promo code', 'PROMO_USAGE_IDEMPOTENCY_CONFLICT');
        }
        await client.query('COMMIT');
        return { consumed: false, duplicate: true, tripId, promoCode, userId: passengerId };
      }

      if (!promo.is_active) throw this._error('Promo code is inactive', 'PROMO_CODE_INACTIVE');
      if (promo.expires_at && new Date(promo.expires_at).getTime() <= Date.now()) {
        throw this._error('Promo code has expired', 'PROMO_CODE_EXPIRED');
      }
      const globalMax = Number(promo.global_max_uses);
      const currentUses = Number(promo.current_uses);
      if (globalMax > 0 && currentUses >= globalMax) {
        throw this._error('Promo code global usage limit reached', 'PROMO_GLOBAL_LIMIT_REACHED');
      }

      // The current trip has not been inserted yet. Count prior usages including
      // legacy rows without trip_id; the promo row lock serializes same-code uses.
      const usageCountResult = await client.query(
        'SELECT COUNT(*)::int AS usage_count FROM promo_usages ' +
        'WHERE user_id = $1 AND promo_code = $2',
        [passengerId, promoCode]
      );
      const userUsageCount = Number(usageCountResult.rows && usageCountResult.rows[0] && usageCountResult.rows[0].usage_count || 0);
      const maxPerUser = Number(promo.max_uses_per_user);
      if (userUsageCount >= maxPerUser) {
        throw this._error('User promo usage limit reached', 'PROMO_USER_LIMIT_REACHED');
      }

      const inserted = await client.query(
        'INSERT INTO promo_usages (user_id, promo_code, trip_id) VALUES ($1, $2, $3) ' +
        'ON CONFLICT (trip_id) WHERE trip_id IS NOT NULL DO NOTHING RETURNING id',
        [passengerId, promoCode, tripId]
      );

      if (!inserted.rows || inserted.rows.length === 0) {
        // Another delivery may have won the unique-index race. Verify the exact
        // persisted tuple before treating the event as an idempotent replay.
        const existing = await client.query(
          'SELECT user_id, promo_code FROM promo_usages WHERE trip_id = $1 FOR UPDATE',
          [tripId]
        );
        const usage = existing.rows && existing.rows[0];
        if (!usage) throw this._error('Promo usage conflict could not be reconciled', 'PROMO_USAGE_IDEMPOTENCY_STATE_INVALID');
        if (String(usage.user_id) !== String(passengerId) || usage.promo_code !== promoCode) {
          throw this._error('Trip promo usage already exists with a different user or promo code', 'PROMO_USAGE_IDEMPOTENCY_CONFLICT');
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
        throw this._error('Promo code disappeared while recording usage', 'PROMO_CODE_NOT_FOUND');
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
