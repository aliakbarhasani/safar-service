/**
 * ResolvePricingRule Use Case
 *
 * Resolves the most specific applicable pricing rule for a given context.
 * Uses caching to reduce database load with a 5-minute TTL.
 * Follows scope hierarchy: Custom Region > Polygon > Street > District > Zone > City > Province > Country > Global
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

class ResolvePricingRule {
  /**
   * @param {Object} deps - Dependencies
   * @param {import('../../domain/interfaces/IRuleResolver')} deps.ruleResolver
   * @param {import('../../domain/interfaces/ICacheProvider')} deps.cacheProvider
   */
  constructor(deps) {
    this.ruleResolver = deps.ruleResolver;
    this.cacheProvider = deps.cacheProvider;
  }

  /**
   * Execute the rule resolution use case
   *
   * @param {Object} context
   * @param {string} context.scopeType - Geographic scope type
   * @param {string} context.scopeId - Scope identifier
   * @param {string} context.serviceType - Service type
   * @returns {Promise<Object>} Resolved pricing rule snapshot
   * @throws {Error} If no rule is found
   */
  async execute(context) {
    const { scopeType, scopeId, serviceType } = context;

    if (!scopeType || !scopeId || !serviceType) {
      throw new Error('scopeType, scopeId, and serviceType are all required');
    }

    const cacheKey = `rule:${scopeType}:${scopeId}:${serviceType}`;

    // Try cache first (fast path)
    const cached = await this.cacheProvider.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Resolve from source (slow path)
    const rule = await this.ruleResolver.resolve(context);
    if (!rule) {
      throw new Error(
        `No pricing rule found for scope ${scopeType}:${scopeId} and service ${serviceType}`
      );
    }

    // Cache the result with 5-minute TTL
    await this.cacheProvider.set(cacheKey, rule.snapshot(), 300);

    return rule;
  }
}

module.exports = ResolvePricingRule;
