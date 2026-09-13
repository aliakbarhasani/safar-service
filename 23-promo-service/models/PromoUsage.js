'use strict';

class PromoUsage {
  constructor(pool) {
    this.pool = pool;
  }

  async recordUsage({ userId, promoCode, tripId }) {
    const { rows } = await this.pool.query(
      'INSERT INTO promo_usages (user_id, promo_code, trip_id) VALUES ($1, $2, $3) RETURNING *',
      [userId, promoCode, tripId]
    );
    return rows[0];
  }
}

module.exports = { PromoUsage };
