/**
 * IPricingEngine Interface - Core pricing engine contract
 *
 * Defines the main entry point for all pricing operations.
 * Implementations should orchestrate rule resolution, multiplier application,
 * and quote generation.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

/**
 * @interface IPricingEngine
 */
class IPricingEngine {
  /**
   * Generate a price quote for a trip request
   * @param {Object} request - Trip details for pricing
   * @param {string} request.serviceType - Type of service (urban_taxi, freight, etc.)
   * @param {string} request.scopeType - Geographic scope (City, Province, etc.)
   * @param {string} request.scopeId - Scope identifier
   * @param {number} request.distanceKm - Trip distance in kilometers
   * @param {number} request.durationMin - Trip duration in minutes
   * @param {string} request.currencyId - Target currency code
   * @returns {Promise<Object>} Generated price quote
   */
  async generateQuote(request) {
    throw new Error('IPricingEngine.generateQuote() not implemented');
  }

  /**
   * Recalculate a price with updated parameters
   * @param {string} quoteId - Original quote identifier
   * @param {Object} updatedParams - Updated trip parameters
   * @returns {Promise<Object>} Updated price quote (new instance)
   */
  async recalculatePrice(quoteId, updatedParams) {
    throw new Error('IPricingEngine.recalculatePrice() not implemented');
  }

  /**
   * Resolve the applicable pricing rule for a given context
   * @param {Object} context - Resolution context
   * @param {string} context.scopeType - Geographic scope
   * @param {string} context.scopeId - Scope identifier
   * @param {string} context.serviceType - Service type
   * @returns {Promise<Object>} Resolved pricing rule
   */
  async resolveRule(context) {
    throw new Error('IPricingEngine.resolveRule() not implemented');
  }
}

module.exports = IPricingEngine;
