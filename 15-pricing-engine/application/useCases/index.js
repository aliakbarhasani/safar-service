/**
 * Application Use Cases Index
 *
 * Aggregates and exports all application layer use cases.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const GeneratePriceQuote = require('./GeneratePriceQuote');
const RecalculatePrice = require('./RecalculatePrice');
const ResolvePricingRule = require('./ResolvePricingRule');

module.exports = {
  GeneratePriceQuote,
  RecalculatePrice,
  ResolvePricingRule,
};
