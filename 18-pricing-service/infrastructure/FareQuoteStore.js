/**
 * FareQuoteStore.js - Infrastructure (Pricing Service, P6-2)
 *
 * Fare Quote pattern (anti-tamper): after CalculateFareUseCase computes a fare,
 * the full quote payload is persisted in Redis under `fare_quote:{quoteId}`
 * with a 5-minute TTL (300s). Mobility must read the quote back by ID when the
 * passenger requests the trip — the client NEVER sends the price directly.
 *
 * Stored payload:
 *   { quoteId, estimatedFare, distance, surgeMultiplier, geohash,
 *     originLat, originLng, destLat, destLng, createdAt, expiresAt }
 */

const FARE_QUOTE_PREFIX = 'fare_quote:';
const FARE_QUOTE_TTL_SECONDS = 300; // 5 minutes

class FareQuoteStore {
  /**
   * @param {Object} redisClient - ioredis-compatible client (get/setex/getex/del)
   * @param {Object} [opts]
   * @param {number} [opts.ttlSeconds]
   */
  constructor(redisClient, { ttlSeconds = FARE_QUOTE_TTL_SECONDS } = {}) {
    if (!redisClient) throw new Error('FareQuoteStore: redisClient is required');
    this.redis = redisClient;
    this.ttlSeconds = ttlSeconds;
  }

  _key(quoteId) {
    return `${FARE_QUOTE_PREFIX}${quoteId}`;
  }

  /** Persist a quote payload (JSON) with TTL. */
  async save(quote) {
    if (!quote || !quote.quoteId) throw new Error('FareQuoteStore.save: quote.quoteId is required');
    const key = this._key(quote.quoteId);
    const payload = JSON.stringify(quote);
    if (typeof this.redis.setex === 'function') {
      await this.redis.setex(key, this.ttlSeconds, payload);
    } else {
      await this.redis.set(key, payload, 'EX', this.ttlSeconds);
    }
    return quote;
  }

  /** Read a quote by ID; returns null when missing/expired/corrupt. */
  async get(quoteId) {
    if (!quoteId) return null;
    let raw = null;
    try {
      raw = await this.redis.get(this._key(quoteId));
    } catch (_) {
      return null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  /**
   * P6-2 contract alias: `saveQuote(quoteId, data, ttl = 300)`.
   * Persists the quote payload under `fare_quote:{quoteId}` with TTL seconds.
   */
  async saveQuote(quoteId, data, ttl = this.ttlSeconds) {
    if (!quoteId) throw new Error('FareQuoteStore.saveQuote: quoteId is required');
    const effectiveTtl = Number(ttl) > 0 ? Number(ttl) : this.ttlSeconds;
    const quote = { quoteId, ...data };
    if (effectiveTtl === this.ttlSeconds) {
      return this.save(quote);
    }
    const payload = JSON.stringify(quote);
    if (typeof this.redis.setex === 'function') {
      await this.redis.setex(this._key(quoteId), effectiveTtl, payload);
    } else {
      await this.redis.set(this._key(quoteId), payload, 'EX', effectiveTtl);
    }
    return quote;
  }

  /** P6-2 contract alias: `getQuote(quoteId)` — same as get(). */
  async getQuote(quoteId) {
    return this.get(quoteId);
  }

  /** Consume (read + delete) — optional one-time-use semantics. */
  async consume(quoteId) {
    const quote = await this.get(quoteId);
    if (quote && typeof this.redis.del === 'function') {
      try { await this.redis.del(this._key(quoteId)); } catch (_) { /* ignore */ }
    }
    return quote;
  }
}

module.exports = { FareQuoteStore, FARE_QUOTE_PREFIX, FARE_QUOTE_TTL_SECONDS };
