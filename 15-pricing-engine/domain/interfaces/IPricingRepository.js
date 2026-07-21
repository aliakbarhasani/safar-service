/**
 * IPricingRepository Interface - Data persistence contract for pricing entities
 *
 * Defines the contract for persisting and retrieving pricing domain entities.
 * Implementations connect to PostgreSQL via the db-pool-validator module.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Created v2
 */

/**
 * @interface IPricingRepository
 */
class IPricingRepository {
  /**
   * Save a new pricing rule
   * @param {Object} rule - PricingRule snapshot
   * @returns {Promise<Object>} Saved rule with generated ID
   */
  async saveRule(rule) {
    throw new Error('IPricingRepository.saveRule() not implemented');
  }

  /**
   * Find an active pricing rule by scope and service type
   * @param {string} scopeType - Geographic scope type
   * @param {string} scopeId - Scope identifier
   * @param {string} serviceType - Service type
   * @returns {Promise<Object|null>} Found rule or null
   */
  async findActiveRule(scopeType, scopeId, serviceType) {
    throw new Error('IPricingRepository.findActiveRule() not implemented');
  }

  /**
   * Save a price quote (immutable)
   * @param {Object} quote - PriceQuote snapshot
   * @returns {Promise<Object>} Saved quote with generated ID
   */
  async saveQuote(quote) {
    throw new Error('IPricingRepository.saveQuote() not implemented');
  }

  /**
   * Find a quote by its ID
   * @param {string} quoteId - Quote identifier
   * @returns {Promise<Object|null>} Found quote or null
   */
  async findQuoteById(quoteId) {
    throw new Error('IPricingRepository.findQuoteById() not implemented');
  }

  /**
   * Update quote status (only status transitions allowed)
   * @param {string} quoteId - Quote identifier
   * @param {string} newStatus - New status value
   * @returns {Promise<Object>} Updated quote
   */
  async updateQuoteStatus(quoteId, newStatus) {
    throw new Error('IPricingRepository.updateQuoteStatus() not implemented');
  }

  /**
   * Log an event to the pricing timeline (audit log)
   * @param {Object} event - Timeline event data
   * @returns {Promise<Object>} Saved timeline entry
   */
  async logTimelineEvent(event) {
    throw new Error('IPricingRepository.logTimelineEvent() not implemented');
  }

  /**
   * Check database connection health
   * @returns {Promise<boolean>} True if database is reachable
   */
  async healthCheck() {
    throw new Error('IPricingRepository.healthCheck() not implemented');
  }
}

module.exports = IPricingRepository;
