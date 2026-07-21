/**
 * IRuleResolver Interface - Pricing rule resolution contract
 *
 * Defines how pricing rules are resolved based on geographic scope hierarchy.
 * Priority: Custom Region > Polygon > Street > District > Zone > City > Province > Country > Global
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

/**
 * @interface IRuleResolver
 */
class IRuleResolver {
  /**
   * Find the most specific matching rule for a given context
   * @param {Object} context - Resolution context
   * @param {string} context.scopeType - Geographic scope type
   * @param {string} context.scopeId - Scope identifier
   * @param {string} context.serviceType - Service type
   * @returns {Promise<Object|null>} Resolved pricing rule or null if not found
   */
  async resolve(context) {
    throw new Error('IRuleResolver.resolve() not implemented');
  }

  /**
   * Get all active rules for a scope
   * @param {string} scopeType - Geographic scope type
   * @param {string} scopeId - Scope identifier
   * @param {string} serviceType - Service type filter
   * @returns {Promise<Array>} List of active pricing rules
   */
  async getActiveRules(scopeType, scopeId, serviceType) {
    throw new Error('IRuleResolver.getActiveRules() not implemented');
  }

  /**
   * Invalidate cached rules for a specific scope
   * @param {string} scopeType - Geographic scope type
   * @param {string} scopeId - Scope identifier
   * @param {string} serviceType - Service type
   * @returns {Promise<void>}
   */
  async invalidateCache(scopeType, scopeId, serviceType) {
    throw new Error('IRuleResolver.invalidateCache() not implemented');
  }
}

module.exports = IRuleResolver;
