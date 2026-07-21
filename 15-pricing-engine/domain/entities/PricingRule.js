/**
 * PricingRule Entity - Domain Entity for pricing rules
 * 
 * This entity represents a pricing rule in the domain layer.
 * It is completely independent of infrastructure concerns (no DB, no framework).
 * 
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED
 */

class PricingRule {
  /**
   * @param {Object} params
   * @param {string} [params.id]
   * @param {number} params.priority - Priority between 1-100
   * @param {string} params.scopeType - Global, Country, Province, City, Zone, District, Street, Polygon, Custom Region
   * @param {string} params.scopeId
   * @param {string} params.serviceType
   * @param {string} params.currencyId
   * @param {number} params.baseFare
   * @param {number} params.perKmRate
   * @param {number} params.perMinuteRate
   * @param {boolean} [params.isActive=true]
   * @param {number} [params.version=1]
   * @param {Date} [params.createdAt]
   * @param {Date} [params.updatedAt]
   */
  constructor(params) {
    this.id = params.id || null;
    this.priority = params.priority;
    this.scopeType = params.scopeType;
    this.scopeId = params.scopeId;
    this.serviceType = params.serviceType;
    this.currencyId = params.currencyId;
    this.baseFare = params.baseFare;
    this.perKmRate = params.perKmRate;
    this.perMinuteRate = params.perMinuteRate;
    this.isActive = params.isActive !== undefined ? params.isActive : true;
    this.version = params.version || 1;
    this.createdAt = params.createdAt || new Date();
    this.updatedAt = params.updatedAt || new Date();
  }

  /**
   * Validate the pricing rule business constraints
   * @throws {Error} if validation fails
   */
  validate() {
    if (!this.priority || this.priority < 1 || this.priority > 100) {
      throw new Error('Priority must be between 1 and 100');
    }
    if (!this.scopeType) {
      throw new Error('Scope type is required');
    }
    if (!this.scopeId) {
      throw new Error('Scope ID is required');
    }
    if (!this.serviceType) {
      throw new Error('Service type is required');
    }
    if (!this.currencyId) {
      throw new Error('Currency ID is required');
    }
    if (this.baseFare < 0) {
      throw new Error('Base fare cannot be negative');
    }
    if (this.perKmRate < 0) {
      throw new Error('Per km rate cannot be negative');
    }
    if (this.perMinuteRate < 0) {
      throw new Error('Per minute rate cannot be negative');
    }
  }

  /**
   * Calculate the base price for a trip
   * @param {number} distanceKm
   * @param {number} durationMin
   * @returns {number}
   */
  calculateBasePrice(distanceKm, durationMin) {
    return this.baseFare + (this.perKmRate * distanceKm) + (this.perMinuteRate * durationMin);
  }

  /**
   * Create a snapshot of the rule for versioning
   * @returns {Object}
   */
  snapshot() {
    return {
      id: this.id,
      priority: this.priority,
      scopeType: this.scopeType,
      scopeId: this.scopeId,
      serviceType: this.serviceType,
      currencyId: this.currencyId,
      baseFare: this.baseFare,
      perKmRate: this.perKmRate,
      perMinuteRate: this.perMinuteRate,
      isActive: this.isActive,
      version: this.version,
    };
  }
}

module.exports = PricingRule;