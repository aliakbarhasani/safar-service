/**
 * RecalculatePrice Use Case
 *
 * Recalculates a price quote with updated trip parameters.
 * Enforces immutability: always creates a NEW quote rather than modifying an existing one.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const GeneratePriceQuote = require('./GeneratePriceQuote');

class RecalculatePrice {
  /**
   * @param {Object} deps - Dependencies
   * @param {import('../../domain/interfaces/IRuleResolver')} deps.ruleResolver
   * @param {import('../../domain/interfaces/IPricingEventPublisher')} deps.eventPublisher
   * @param {import('../../domain/interfaces/ICacheProvider')} deps.cacheProvider
   * @param {Object} deps.config - Engine configuration
   */
  constructor(deps) {
    this.generateQuote = new GeneratePriceQuote(deps);
  }

  /**
   * Execute the recalculation use case
   *
   * @param {Object} params
   * @param {string} params.originalQuoteId - The original quote ID (for traceability)
   * @param {Object} params.updatedRequest - Updated trip details
   * @returns {Promise<import('../../domain/entities/PriceQuote')>} New price quote
   */
  async execute(params) {
    const { originalQuoteId, updatedRequest } = params;

    if (!originalQuoteId) {
      throw new Error('Original quote ID is required for recalculation');
    }
    if (!updatedRequest) {
      throw new Error('Updated trip request data is required');
    }

    // Immutability: always create a new quote, never modify existing
    const newQuote = await this.generateQuote.execute({
      ...updatedRequest,
      tripRequestId: originalQuoteId,
    });

    return newQuote;
  }
}

module.exports = RecalculatePrice;
