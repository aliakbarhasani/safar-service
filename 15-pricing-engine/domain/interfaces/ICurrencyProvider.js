/**
 * ICurrencyProvider Interface - Currency operations contract
 *
 * Defines currency conversion and rate retrieval operations.
 * Implementations can connect to external exchange rate APIs or use cached rates.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

/**
 * @interface ICurrencyProvider
 */
class ICurrencyProvider {
  /**
   * Convert an amount from one currency to another
   * @param {number} amount - Amount to convert
   * @param {string} fromCurrency - Source currency code (e.g., 'IRT')
   * @param {string} toCurrency - Target currency code (e.g., 'USD')
   * @returns {Promise<number>} Converted amount
   */
  async convert(amount, fromCurrency, toCurrency) {
    throw new Error('ICurrencyProvider.convert() not implemented');
  }

  /**
   * Get the current exchange rate between two currencies
   * @param {string} fromCurrency - Source currency code
   * @param {string} toCurrency - Target currency code
   * @returns {Promise<number>} Exchange rate
   */
  async getRate(fromCurrency, toCurrency) {
    throw new Error('ICurrencyProvider.getRate() not implemented');
  }

  /**
   * Get the default currency for a country
   * @param {string} countryId - Country identifier
   * @returns {Promise<string>} Default currency code
   */
  async getDefaultCurrency(countryId) {
    throw new Error('ICurrencyProvider.getDefaultCurrency() not implemented');
  }
}

module.exports = ICurrencyProvider;
