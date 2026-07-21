/**
 * PricingEvents - Factory methods for standardized pricing domain events
 *
 * Provides static factory methods for creating standardized pricing events
 * using the EventContract envelope. Each method corresponds to a specific
 * domain event type.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const EventContract = require('./EventContract');

class PricingEvents {
  /**
   * Create a QuoteGenerated event
   *
   * @param {Object} quote - Quote snapshot object
   * @param {string} [correlationId] - Correlation ID for event tracing
   * @returns {Object} Standardized event envelope
   */
  static quoteGenerated(quote, correlationId) {
    return EventContract.create({
      eventType: EventContract.EventTypes.QUOTE_GENERATED,
      payload: {
        quoteId: quote.id,
        tripRequestId: quote.tripRequestId,
        totalPrice: quote.totalPrice,
        currencyId: quote.currencyId,
        priceBreakdown: quote.priceBreakdown,
        expiresAt: quote.expiresAt,
        pricingEngineVersion: quote.pricingEngineVersion,
        algorithmVersion: quote.algorithmVersion,
        requestHash: quote.requestHash,
      },
      correlationId,
    });
  }

  /**
   * Create a RuleCreated event
   *
   * @param {Object} rule - Rule snapshot object
   * @param {string} [correlationId] - Correlation ID for event tracing
   * @returns {Object} Standardized event envelope
   */
  static ruleCreated(rule, correlationId) {
    return EventContract.create({
      eventType: EventContract.EventTypes.RULE_CREATED,
      payload: {
        ruleId: rule.id,
        priority: rule.priority,
        scopeType: rule.scopeType,
        scopeId: rule.scopeId,
        serviceType: rule.serviceType,
        currencyId: rule.currencyId,
        baseFare: rule.baseFare,
        perKmRate: rule.perKmRate,
        perMinuteRate: rule.perMinuteRate,
        version: rule.version,
      },
      correlationId,
    });
  }

  /**
   * Create a SurgeActivated event
   *
   * @param {Object} surgeInfo - Surge pricing information
   * @param {string} surgeInfo.ruleId - Associated rule ID
   * @param {string} surgeInfo.adapterKey - Adapter key (traffic, weather, ai_demand)
   * @param {number} surgeInfo.multiplier - Applied multiplier value
   * @param {string} surgeInfo.reason - Reason for surge activation
   * @param {string} [correlationId] - Correlation ID
   * @returns {Object} Standardized event envelope
   */
  static surgeActivated(surgeInfo, correlationId) {
    return EventContract.create({
      eventType: EventContract.EventTypes.SURGE_ACTIVATED,
      payload: {
        ruleId: surgeInfo.ruleId,
        adapterKey: surgeInfo.adapterKey,
        multiplier: surgeInfo.multiplier,
        reason: surgeInfo.reason,
        activatedAt: new Date().toISOString(),
      },
      correlationId,
    });
  }

  /**
   * Create a QuoteExpired event
   *
   * @param {Object} quote - Quote snapshot
   * @param {string} [correlationId] - Correlation ID
   * @returns {Object} Standardized event envelope
   */
  static quoteExpired(quote, correlationId) {
    return EventContract.create({
      eventType: EventContract.EventTypes.QUOTE_EXPIRED,
      payload: {
        quoteId: quote.id,
        tripRequestId: quote.tripRequestId,
        expiredAt: new Date().toISOString(),
      },
      correlationId,
    });
  }
}

module.exports = PricingEvents;
