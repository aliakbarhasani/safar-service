/**
 * ICacheProvider Interface - Caching contract
 *
 * Defines caching operations for the pricing engine.
 * No coupling to any specific caching technology (Redis, Memcached, In-memory).
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

/**
 * @interface ICacheProvider
 */
class ICacheProvider {
  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {Promise<*>} Cached value or null if not found
   */
  async get(key) {
    throw new Error('ICacheProvider.get() not implemented');
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds) {
    throw new Error('ICacheProvider.set() not implemented');
  }

  /**
   * Delete a value from cache
   * @param {string} key - Cache key to delete
   * @returns {Promise<void>}
   */
  async del(key) {
    throw new Error('ICacheProvider.del() not implemented');
  }

  /**
   * Clear all cached pricing rules
   * @returns {Promise<void>}
   */
  async clearRules() {
    throw new Error('ICacheProvider.clearRules() not implemented');
  }
}

module.exports = ICacheProvider;
