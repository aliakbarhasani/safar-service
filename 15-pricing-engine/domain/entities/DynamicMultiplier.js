/**
 * DynamicMultiplier Entity - Dynamic price multipliers with safety caps
 *
 * Represents dynamic factors that affect pricing with a platform-enforced
 * maximum ceiling of 3.5x to prevent price gouging.
 *
 * Supported adapter keys: traffic, weather, ai_demand
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */
class DynamicMultiplier {
  /** Platform-enforced maximum multiplier ceiling */
  static get MAX_CEILING() { return 3.5; }

  /** Platform-enforced minimum multiplier floor */
  static get MIN_FLOOR() { return 0.5; }

  /**
   * @param {Object} params
   * @param {string} [params.id]
   * @param {string} params.ruleId - Associated pricing rule ID
   * @param {string} params.adapterKey - One of: traffic, weather, ai_demand
   * @param {number} params.multiplier - Must be between 0.5 and 3.5
   * @param {string} [params.reason] - Human-readable reason for this multiplier
   * @param {boolean} [params.isActive=true]
   * @param {number} [params.version=1]
   * @param {Date|string} [params.createdAt]
   * @param {Date|string} [params.updatedAt]
   */
  constructor(params) {
    this.id = params.id || null;
    this.ruleId = params.ruleId;
    this.adapterKey = params.adapterKey;
    this.multiplier = this._clamp(params.multiplier);
    this.reason = params.reason || '';
    this.isActive = params.isActive !== undefined ? params.isActive : true;
    this.version = params.version || 1;
    this.createdAt = params.createdAt ? (params.createdAt instanceof Date ? params.createdAt : new Date(params.createdAt)) : new Date();
    this.updatedAt = params.updatedAt ? (params.updatedAt instanceof Date ? params.updatedAt : new Date(params.updatedAt)) : new Date();
  }

  /**
   * Clamp multiplier within platform safety bounds
   * @param {number} value
   * @returns {number}
   * @private
   */
  _clamp(value) {
    return Math.min(DynamicMultiplier.MAX_CEILING, Math.max(DynamicMultiplier.MIN_FLOOR, value));
  }

  /**
   * Validate business constraints
   * @throws {Error} if validation fails
   */
  validate() {
    if (!this.ruleId) throw new Error('Rule ID is required');
    if (!this.adapterKey) throw new Error('Adapter key is required (traffic, weather, ai_demand)');
    if (!['traffic', 'weather', 'ai_demand'].includes(this.adapterKey)) {
      throw new Error('Invalid adapter key. Must be traffic, weather, or ai_demand');
    }
    if (this.multiplier <= 0) throw new Error('Multiplier must be greater than 0');
  }

  /**
   * Apply this multiplier to a base price with safety ceiling
   * @param {number} basePrice - The base price before multiplier
   * @returns {number} The multiplied price, capped at MAX_CEILING
   */
  apply(basePrice) {
    if (!this.isActive) return basePrice;
    const raw = basePrice * this.multiplier;
    const capped = Math.min(raw, basePrice * DynamicMultiplier.MAX_CEILING);
    return capped;
  }

  /**
   * Create a snapshot for versioning and audit
   * @returns {Object}
   */
  snapshot() {
    return {
      id: this.id,
      ruleId: this.ruleId,
      adapterKey: this.adapterKey,
      multiplier: this.multiplier,
      reason: this.reason,
      isActive: this.isActive,
      version: this.version,
    };
  }
}

module.exports = DynamicMultiplier;
