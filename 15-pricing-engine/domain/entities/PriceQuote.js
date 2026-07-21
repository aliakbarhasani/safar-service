/**
 * PriceQuote Entity - Domain Entity for immutable price quotes
 *
 * Represents a calculated price quote. Financial fields are immutable
 * after creation. Status transitions are controlled: ACTIVE -> USED|EXPIRED|CANCELLED.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */
class PriceQuote {
  /**
   * @param {Object} params
   * @param {string} [params.id] - Unique quote identifier
   * @param {string} params.tripRequestId - Associated trip request
   * @param {Object} params.priceBreakdown - Detailed breakdown object
   * @param {number} params.totalPrice - Final calculated price
   * @param {string} params.currencyId - Currency code (e.g. IRT, AFN, USD)
   * @param {string} [params.status='ACTIVE'] - One of: ACTIVE, USED, EXPIRED, CANCELLED
   * @param {Date|string} params.expiresAt - Quote expiration timestamp
   * @param {string} params.pricingEngineVersion - Engine version used for calculation
   * @param {number} params.ruleVersion - Version of the applied pricing rule
   * @param {number} params.multiplierVersion - Version of applied multipliers
   * @param {string} params.algorithmVersion - Algorithm identifier
   * @param {string} params.configVersion - Configuration snapshot version
   * @param {string} params.requestHash - SHA-256 hash of input parameters for audit
   * @param {number} [params.version=1] - Optimistic locking version
   * @param {Date|string} [params.createdAt] - Creation timestamp
   * @param {Date|string} [params.updatedAt] - Last update timestamp
   */
  constructor(params) {
    this.id = params.id || null;
    this.tripRequestId = params.tripRequestId;
    this.priceBreakdown = params.priceBreakdown;
    this.totalPrice = params.totalPrice;
    this.currencyId = params.currencyId;
    this.status = params.status || 'ACTIVE';
    this.expiresAt = params.expiresAt instanceof Date ? params.expiresAt : new Date(params.expiresAt);
    this.pricingEngineVersion = params.pricingEngineVersion;
    this.ruleVersion = params.ruleVersion;
    this.multiplierVersion = params.multiplierVersion;
    this.algorithmVersion = params.algorithmVersion;
    this.configVersion = params.configVersion;
    this.requestHash = params.requestHash;
    this.version = params.version || 1;
    this.createdAt = params.createdAt ? (params.createdAt instanceof Date ? params.createdAt : new Date(params.createdAt)) : new Date();
    this.updatedAt = params.updatedAt ? (params.updatedAt instanceof Date ? params.updatedAt : new Date(params.updatedAt)) : new Date();

    // Freeze financial fields to enforce immutability
    Object.freeze(this.priceBreakdown);
  }

  /**
   * Validate business constraints
   * @throws {Error} if validation fails
   */
  validate() {
    if (!this.tripRequestId) throw new Error('Trip request ID is required');
    if (!this.priceBreakdown || typeof this.priceBreakdown !== 'object') throw new Error('Price breakdown is required');
    if (this.totalPrice < 0) throw new Error('Total price cannot be negative');
    if (!this.currencyId) throw new Error('Currency ID is required');
    if (!['ACTIVE', 'USED', 'EXPIRED', 'CANCELLED'].includes(this.status)) {
      throw new Error('Invalid status. Must be ACTIVE, USED, EXPIRED, or CANCELLED');
    }
    if (!this.expiresAt) throw new Error('Expiry date is required');
    if (!this.requestHash) throw new Error('Request hash is required for audit trail');
  }

  /**
   * Check if the quote is still valid at a given time
   * @param {Date} [currentTime=new Date()] - Injected time for testability
   * @returns {boolean}
   */
  isValid(currentTime) {
    const now = currentTime || new Date();
    return this.status === 'ACTIVE' && this.expiresAt > now;
  }

  /**
   * Mark the quote as used
   * @throws {Error} if quote is not ACTIVE
   */
  markAsUsed() {
    if (this.status !== 'ACTIVE') throw new Error('Only ACTIVE quotes can be marked as used');
    this.status = 'USED';
    this.updatedAt = new Date();
  }

  /**
   * Expire the quote
   */
  expire() {
    this.status = 'EXPIRED';
    this.updatedAt = new Date();
  }

  /**
   * Cancel the quote
   */
  cancel() {
    this.status = 'CANCELLED';
    this.updatedAt = new Date();
  }

  /**
   * Create an immutable snapshot for audit trail
   * @returns {Object}
   */
  snapshot() {
    return {
      id: this.id,
      tripRequestId: this.tripRequestId,
      priceBreakdown: { ...this.priceBreakdown },
      totalPrice: this.totalPrice,
      currencyId: this.currencyId,
      status: this.status,
      expiresAt: this.expiresAt.toISOString(),
      pricingEngineVersion: this.pricingEngineVersion,
      ruleVersion: this.ruleVersion,
      multiplierVersion: this.multiplierVersion,
      algorithmVersion: this.algorithmVersion,
      configVersion: this.configVersion,
      requestHash: this.requestHash,
      version: this.version,
      createdAt: this.createdAt.toISOString(),
    };
  }
}

module.exports = PriceQuote;
