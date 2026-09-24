/**
 * Application Layer Index
 *
 * Aggregates and exports all application layer modules.
 *
 * Architecture: Clean Architecture - Application Layer
 * Status: LOCKED | Refactored v2
 */

const GenerateQuoteUseCase = require('./GenerateQuoteUseCase');
const GetQuoteUseCase = require('./GetQuoteUseCase');
const ConsumeQuoteUseCase = require('./ConsumeQuoteUseCase');
const events = require('./events');

// Grouped view (`application.useCases.*`) kept for readability/back-compat;
// the same classes are also exported flat for direct destructuring.
const useCases = {
  GenerateQuoteUseCase,
  GetQuoteUseCase,
  ConsumeQuoteUseCase,
};

module.exports = {
  useCases,
  events,
  GenerateQuoteUseCase,
  GetQuoteUseCase,
  ConsumeQuoteUseCase,
};
