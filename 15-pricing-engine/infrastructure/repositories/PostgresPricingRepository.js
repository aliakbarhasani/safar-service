/**
 * PostgresPricingRepository
 *
 * Lightweight PostgreSQL-backed pricing repository with a resilient
 * in-memory fallback for quote persistence during connection failures.
 */
const crypto = require('crypto');
const { dbPool } = require('../db-pool-validator.js');
const IPricingRepository = require('../../domain/interfaces/IPricingRepository');

class PostgresPricingRepository extends IPricingRepository {
  constructor() {
    super();
    this.dbPool = dbPool;
    this._memoryStore = new Map();
  }

  _createId() {
    return crypto.randomUUID();
  }

  _isConnectionError(error) {
    const message = (error && error.message ? error.message : '').toLowerCase();
    return ['econnrefused', 'econnreset', 'etimedout', 'enotfound', 'socket', 'timeout'].some(token => message.includes(token));
  }

  async saveQuote(priceQuote) {
    const quoteId = priceQuote && priceQuote.id ? priceQuote.id : this._createId();
    const now = new Date().toISOString();
    const record = {
      ...priceQuote,
      id: quoteId,
      createdAt: priceQuote && priceQuote.createdAt ? priceQuote.createdAt : now,
      updatedAt: now,
    };

    try {
      if (!this.dbPool || typeof this.dbPool.query !== 'function') {
        throw new Error('Database pool is unavailable');
      }

      const result = await this.dbPool.query(
        'INSERT INTO price_quotes (id, total_price, currency_id, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [quoteId, record.totalPrice, record.currencyId, record.status || 'ACTIVE', record.createdAt, record.updatedAt]
      );

      return result.rows && result.rows[0] ? result.rows[0] : record;
    } catch (error) {
      console.warn('[PricingRepo] PostgreSQL saveQuote failed, using in-memory fallback:', error.message);
      this._memoryStore.set(quoteId, record);
      return record;
    }
  }

  async getQuoteById(quoteId) {
    try {
      if (!this.dbPool || typeof this.dbPool.query !== 'function') {
        throw new Error('Database pool is unavailable');
      }

      const result = await this.dbPool.query('SELECT * FROM price_quotes WHERE id = $1', [quoteId]);
      if (result.rows && result.rows[0]) {
        return result.rows[0];
      }
    } catch (error) {
      console.warn('[PricingRepo] PostgreSQL getQuoteById failed, using in-memory fallback:', error.message);
    }

    return this._memoryStore.get(quoteId) || null;
  }

  async findQuoteById(quoteId) {
    return this.getQuoteById(quoteId);
  }
}

module.exports = PostgresPricingRepository;