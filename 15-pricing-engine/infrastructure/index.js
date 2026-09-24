/**
 * Infrastructure Layer Index
 *
 * Aggregates and exports the infrastructure adapters.
 *
 * Architecture: Clean Architecture - Infrastructure Layer
 */

const DatabasePoolValidator = require("./db-pool-validator");
const PricingRepository = require("./PricingRepository");
const PostgresPricingRuleResolver = require("./repositories/PostgresPricingRuleResolver");
const MockRuleResolver = require("./MockRuleResolver");
const MockCacheProvider = require("./MockCacheProvider");
const MockEventPublisher = require("./MockEventPublisher");

module.exports = {
  DatabasePoolValidator,
  PricingRepository,
  PostgresPricingRuleResolver,
  MockRuleResolver,
  MockCacheProvider,
  MockEventPublisher,
};