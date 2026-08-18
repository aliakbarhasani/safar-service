/**
 * MockRuleResolver - Infrastructure implementation of IRuleResolver
 *
 * Provides a mock rule resolver that returns a default pricing rule
 * for any scope/service combination. Used for development/testing.
 *
 * Architecture: Clean Architecture - Infrastructure Layer
 * Status: LOCKED | Created v2
 */

const { PricingRule } = require('../domain');

class MockRuleResolver {
  /**
   * @param {Object} [options]
   * @param {PricingRule} [options.defaultRule] - Custom default rule
   */
  constructor(options = {}) {
    this.defaultRule = options.defaultRule || new PricingRule({
      priority: 50,
      scopeType: 'City',
      scopeId: 'default',
      serviceType: 'urban_taxi',
      currencyId: 'IRT',
      baseFare: 15000,
      perKmRate: 5000,
      perMinuteRate: 1000,
    });
  }

  /**
   * Resolve a pricing rule for the given context
   * @param {Object} context
   * @param {string} context.scopeType
   * @param {string} context.scopeId
   * @param {string} context.serviceType
   * @returns {Promise<PricingRule>}
   */
  async resolve(context) {
    return this.defaultRule;
  }
}

module.exports = MockRuleResolver;