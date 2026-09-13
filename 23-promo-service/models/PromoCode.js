'use strict';

class PromoCode {
  constructor(pool) {
    this.pool = pool;
  }

  async findByCode(code) {
    const { rows } = await this.pool.query(
      'SELECT * FROM promo_codes WHERE code = $1',
      [code]
    );
    return rows[0] || null;
  }

  async incrementUsage(code) {
    const { rows } = await this.pool.query(
      'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE code = $1 RETURNING *',
      [code]
    );
    return rows[0] || null;
  }

  async countUserUsages(code, userId) {
    const { rows } = await this.pool.query(
      'SELECT COUNT(*)::int AS cnt FROM promo_usages WHERE promo_code = $1 AND user_id = $2',
      [code, userId]
    );
    return rows[0] ? rows[0].cnt : 0;
  }
}

module.exports = { PromoCode };
