/**
 * Domain Layer Index
 *
 * Aggregates and exports all domain entities, value objects, and interfaces.
 *
 * Architecture: Clean Architecture - Domain Layer
 * Status: LOCKED | Refactored v2
 */

// Entities
const PricingRule = require('./entities/PricingRule');
const PriceQuote = require('./entities/PriceQuote');
const DynamicMultiplier = require('./entities/DynamicMultiplier');

// Value Objects
const PriceBreakdown = require('./valueObjects/PriceBreakdown');

// Interfaces
const IPricingEngine = require('./interfaces/IPricingEngine');
const IRuleResolver = require('./interfaces/IRuleResolver');
const ICurrencyProvider = require('./interfaces/ICurrencyProvider');
const ICacheProvider = require('./interfaces/ICacheProvider');
const IPricingEventPublisher = require('./interfaces/IPricingEventPublisher');
const IPricingRepository = require('./interfaces/IPricingRepository');

module.exports = {
  PricingRule,
  PriceQuote,
  DynamicMultiplier,
  PriceBreakdown,
  IPricingEngine,
  IRuleResolver,
  ICurrencyProvider,
  ICacheProvider,
  IPricingEventPublisher,
  IPricingRepository,
};
