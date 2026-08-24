/**
 * GeneratePriceQuote Use Case
 * 
 * Orchestrates the process of generating a price quote:
 * 1. Resolve the applicable pricing rule
 * 2. Calculate base price
 * 3. Apply dynamic multipliers
 * 4. Apply surcharges/discounts
 * 5. Create and return the PriceQuote
 * 
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED
 */

const crypto = require('crypto');
const { PriceQuote, PriceBreakdown } = require('../../../domain');

class GeneratePriceQuote {
  /**
   * @param {Object} deps
   * @param {import('../../domain/interfaces/IRuleResolver')} deps.ruleResolver
   * @param {import('../../domain/interfaces/IPricingEventPublisher')} deps.eventPublisher
   * @param {import('../../domain/interfaces/ICacheProvider')} deps.cacheProvider
   * @param {Object} deps.config - Engine configuration
   */
  constructor(deps) {
    this.ruleResolver = deps.ruleResolver;
    this.eventPublisher = deps.eventPublisher;
    this.cacheProvider = deps.cacheProvider;
    this.config = deps.config;
  }

  /**
   * Execute the use case
   * 
   * @param {Object} request
   * @param {string} request.tripRequestId
   * @param {string} request.serviceType
   * @param {string} request.scopeType
   * @param {string} request.scopeId
   * @param {number} request.distanceKm
   * @param {number} request.durationMin
   * @param {string} request.currencyId
   * @param {Array<Object>} [request.multiplierData] - Real-time multiplier data from adapters
   * @returns {Promise<PriceQuote>}
   */
  async execute(request) {
    // 1. Resolve the applicable pricing rule
    const rule = await this.ruleResolver.resolve({
      scopeType: request.scopeType,
      scopeId: request.scopeId,
      serviceType: request.serviceType,
    });

    if (!rule) {
      throw new Error(`No pricing rule found for scope ${request.scopeType}:${request.scopeId} and service ${request.serviceType}`);
    }

    // 2. Calculate base price from the rule
    const basePrice = rule.calculateBasePrice(request.distanceKm, request.durationMin);

    // 3. Apply dynamic multipliers
    const multipliers = await this._resolveMultipliers(rule, request);

    // 4. Build price breakdown
    const breakdown = new PriceBreakdown({
      baseFare: rule.baseFare,
      distanceCharge: rule.perKmRate * request.distanceKm,
      timeCharge: rule.perMinuteRate * request.durationMin,
      multipliers: multipliers.map(m => ({ key: m.adapterKey, factor: m.multiplier })),
      surcharges: [],
      discount: 0,
    });

    // 5. Generate request hash for audit trail
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ ...request, resolvedRuleId: rule.id }))
      .digest('hex');

    // 6. Create the quote with expiry (default: 5 minutes)
    const expiresAt = new Date(Date.now() + (this.config.quoteTTLMinutes || 5) * 60 * 1000);

    const quote = new PriceQuote({
      tripRequestId: request.tripRequestId,
      priceBreakdown: breakdown.toJSON(),
      totalPrice: breakdown.total,
      currencyId: request.currencyId,
      status: 'ACTIVE',
      expiresAt,
      pricingEngineVersion: this.config.engineVersion || '1.0.0',
      ruleVersion: rule.version,
      multiplierVersion: this.config.multiplierVersion || 1,
      algorithmVersion: this.config.algorithmVersion || '1.0.0',
      configVersion: this.config.configVersion || '1.0.0',
      requestHash,
    });

    quote.validate();

    // 7. Publish event
    await this.eventPublisher.publishQuoteGenerated(quote.snapshot());

    return quote;
  }

  /**
   * Resolve dynamic multipliers for the rule
   * @private
   * @param {Object} rule
   * @param {Object} request
   * @returns {Promise<Array>}
   */
  async _resolveMultipliers(rule, request) {
    // This is a placeholder for future adapter integration
    // Real implementation would query traffic, weather, AI demand adapters
    if (request.multiplierData && request.multiplierData.length > 0) {
      return request.multiplierData;
    }
    return [];
  }
}

module.exports = GeneratePriceQuote;