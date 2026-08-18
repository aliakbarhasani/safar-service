/**
 * MockCacheProvider - Infrastructure implementation of ICacheProvider
 *
 * In-memory cache provider with TTL support for development/testing.
 *
 * Architecture: Clean Architecture - Infrastructure Layer
 * Status: LOCKED | Created v2
 */

class MockCacheProvider {
  constructor() {
    this._store = new Map();
  }

  /**
   * Get a value from cache
   * @param {string} key
   * @returns {Promise<*>}
   */
  async get(key) {
    const entry = this._store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this._store.delete(key);
      return null;
    }
    return entry.value;
  }

  /**
   * Set a value in cache with optional TTL
   * @param {string} key
   * @param {*} value
   * @param {number} [ttlSeconds=300]
   * @returns {Promise<void>}
   */
  async set(key, value, ttlSeconds = 300) {
    this._store.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    });
  }

  /**
   * Clear all cached entries
   * @returns {Promise<void>}
   */
  async clear() {
    this._store.clear();
  }
}

module.exports = MockCacheProvider;