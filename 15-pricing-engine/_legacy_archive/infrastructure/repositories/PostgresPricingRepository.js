/**
 * PostgresPricingRepository
 *
 * Lightweight PostgreSQL-backed pricing repository with a resilient
 * in-memory fallback for quote persistence during connection failures.
 */
const crypto = require('crypto');
const { dbPool } = require('../../../infrastructure/db-pool-validator.js');
const IPricingRepository = require('../../../domain/interfaces/IPricingRepository');

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

      // جدول quotes (Migration 017) — مپینگ کامل به ستون‌ها (شامل ستون‌های NOT NULL):
      //   total_price      -> customer_final_amount (و gross_amount/provider_amount)
      //   currency_id      -> currency_code
      const amount = record.totalPrice || record.customerFinalAmount || 0;
      const inputSnapshot = record.inputSnapshot || record.input_snapshot || JSON.stringify(record.priceBreakdown || {});
      const calcSnapshot = record.calculationSnapshot || record.calculation_snapshot || '{}';
      const result = await this.dbPool.query(
        `INSERT INTO quotes (
            id, reference_id, pricing_config_id, service_type, currency_code,
            gross_amount, discount_amount, tax_amount, commission_amount,
            provider_amount, customer_final_amount, status,
            input_snapshot, calculation_snapshot, created_at, expires_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
        [
          quoteId,
          record.referenceId || record.reference_id || null,
          record.pricingConfigId || record.pricing_config_id || '00000000-0000-4000-8000-000000000000',
          record.serviceType || record.service_type || 'urban_taxi',
          record.currencyId || record.currencyCode || record.currency_code || 'IRT',
          amount,
          record.discountAmount || record.discount_amount || 0,
          record.taxAmount || record.tax_amount || 0,
          record.commissionAmount || record.commission_amount || 0,
          amount,
          amount,
          record.status || 'CREATED',
          inputSnapshot,
          calcSnapshot,
          record.createdAt || new Date().toISOString(),
          record.expiresAt || record.expires_at || new Date(Date.now() + 3600000).toISOString(),
        ]
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

      const result = await this.dbPool.query('SELECT id, reference_id, customer_final_amount AS total_price, currency_code AS currency_id, status, created_at FROM quotes WHERE id = $1', [quoteId]);
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