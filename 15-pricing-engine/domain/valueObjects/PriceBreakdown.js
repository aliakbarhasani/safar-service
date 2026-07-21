/**
 * PriceBreakdown Value Object - Immutable breakdown of price components
 *
 * This value object represents the detailed breakdown of a calculated price.
 * It is fully immutable - once created, its values cannot be changed.
 * All financial calculations are performed via getters.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */
class PriceBreakdown {
  /**
   * @param {Object} params
   * @param {number} params.baseFare - Base fare amount
   * @param {number} params.distanceCharge - Distance-based charge
   * @param {number} params.timeCharge - Time-based charge
   * @param {Array<{key: string, factor: number}>} [params.multipliers=[]] - Applied dynamic multipliers
   * @param {Array<{name: string, amount: number}>} [params.surcharges=[]] - Additional surcharges
   * @param {number} [params.discount=0] - Applied discount amount
   */
  constructor(params) {
    this.baseFare = params.baseFare;
    this.distanceCharge = params.distanceCharge;
    this.timeCharge = params.timeCharge;
    this.multipliers = Object.freeze([...(params.multipliers || [])]);
    this.surcharges = Object.freeze([...(params.surcharges || [])]);
    this.discount = params.discount || 0;

    // Make the entire instance immutable
    Object.freeze(this);
  }

  /**
   * Calculate the subtotal before multipliers and surcharges
   * @returns {number}
   */
  get subtotal() {
    return this.baseFare + this.distanceCharge + this.timeCharge;
  }

  /**
   * Calculate the total multiplier factor (product of all multipliers)
   * @returns {number}
   */
  get totalMultiplierFactor() {
    return this.multipliers.reduce((acc, m) => acc * m.factor, 1);
  }

  /**
   * Calculate the total surcharges
   * @returns {number}
   */
  get totalSurcharges() {
    return this.surcharges.reduce((acc, s) => acc + s.amount, 0);
  }

  /**
   * Calculate the final total price
   * Formula: max(0, (subtotal * multiplierFactor) + surcharges - discount)
   * @returns {number}
   */
  get total() {
    const afterMultipliers = this.subtotal * this.totalMultiplierFactor;
    const afterSurcharges = afterMultipliers + this.totalSurcharges;
    return Math.max(0, afterSurcharges - this.discount);
  }

  /**
   * Convert to a plain JSON object for persistence
   * @returns {Object}
   */
  toJSON() {
    return {
      baseFare: this.baseFare,
      distanceCharge: this.distanceCharge,
      timeCharge: this.timeCharge,
      subtotal: this.subtotal,
      multipliers: [...this.multipliers],
      totalMultiplierFactor: this.totalMultiplierFactor,
      surcharges: [...this.surcharges],
      totalSurcharges: this.totalSurcharges,
      discount: this.discount,
      total: this.total,
    };
  }
}

module.exports = PriceBreakdown;
