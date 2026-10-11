'use strict';

/**
 * Records promo usage once per completed trip. The trip-keyed PostgreSQL
 * transaction advisory lock makes duplicate event delivery safe during retries.
 */
class TripCompletedHandler {
  constructor({ promoCodeModel, promoUsageModel, pool = null, eventBus = null, eventName = 'TripCompleted' }) {
    this.promoCodeModel = promoCodeModel;
    this.promoUsageModel = promoUsageModel;
    this.pool = pool;
    this.eventBus = eventBus;
    this.eventName = eventName;
    this._subscribed = false;
  }

  async handle({ tripId, passengerId, promoCode } = {}) {
    if (!promoCode) return { consumed: false };
    if (!tripId || !passengerId) throw new Error('TripCompleted payload must include tripId and passengerId');
    const pool = this.pool || (this.promoCodeModel && this.promoCodeModel.pool);
    if (!pool || typeof pool.connect !== 'function') {
      throw new Error('TripCompletedHandler requires a PostgreSQL pool for atomic promo usage recording');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [String(tripId)]);
      const existing = await client.query('SELECT id FROM promo_usages WHERE trip_id = $1 LIMIT 1', [tripId]);
      if (existing.rows && existing.rows.length > 0) {
        await client.query('COMMIT');
        return { consumed: false, duplicate: true, tripId, promoCode };
      }
      await client.query('INSERT INTO promo_usages (user_id, promo_code, trip_id) VALUES ($1, $2, $3)', [passengerId, promoCode, tripId]);
      const updated = await client.query(
        'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE code = $1 RETURNING code',
        [promoCode],
      );
      if (!updated.rows || updated.rows.length === 0) throw new Error('Promo code no longer exists; usage was not recorded');
      await client.query('COMMIT');
      return { consumed: true, tripId, promoCode, userId: passengerId };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
      throw err;
    } finally {
      client.release();
    }
  }

  subscribe() {
    if (!this.eventBus || !this.eventBus.on || this._subscribed) return;
    this.eventBus.on(this.eventName, (payload) => {
      const eventData = payload && payload.data && payload.event ? payload.data : (payload || {});
      this.handle(eventData).catch((err) => {
        if (this.eventBus && this.eventBus.logger) this.eventBus.logger.error('TripCompletedHandler failed', err);
        else console.warn('[promo] TripCompletedHandler failed: ' + err.message);
      });
    });
    this._subscribed = true;
  }
}

module.exports = { TripCompletedHandler };
