/**
 * PricingServiceAdapter
 *
 * Adapter between the Trip Management module and the Pricing Engine.
 * Keeps the trip workflow loosely coupled while delegating fare generation
 * to the pricing engine through the GeneratePriceQuote use case.
 */
const pricingEngine = require('../../../15-pricing-engine');
const { GeneratePriceQuote } = pricingEngine.application.useCases;
const { PricingRule } = pricingEngine.domain;

class PricingServiceAdapter {
  constructor(generateQuoteUseCase = null) {
    this.generateQuoteUseCase = generateQuoteUseCase || this._createDefaultUseCase();
  }

  _createDefaultUseCase() {
    const ruleResolver = {
      async resolve() {
        return new PricingRule({
          id: 'default-rule',
          priority: 50,
          scopeType: 'City',
          scopeId: 'default',
          serviceType: 'urban_taxi',
          currencyId: 'IRT',
          baseFare: 15000,
          perKmRate: 5000,
          perMinuteRate: 1000,
          version: 1,
        });
      },
    };

    const eventPublisher = {
      async publishQuoteGenerated() {},
    };

    const cacheProvider = {
      async get() {
        return null;
      },
      async set() {},
    };

    return new GeneratePriceQuote({
      ruleResolver,
      eventPublisher,
      cacheProvider,
      config: {
        quoteTTLMinutes: 5,
        engineVersion: '1.0.0',
        multiplierVersion: 1,
        algorithmVersion: '1.0.0',
        configVersion: '1.0.0',
      },
    });
  }

  _extractDistanceKm(tripDetails = {}) {
    const candidates = [
      tripDetails.distanceKm,
      tripDetails.distance,
      tripDetails.distance_km,
      tripDetails.route?.distanceKm,
      tripDetails.route?.distance,
      tripDetails.tripDistanceKm,
    ];

    for (const candidate of candidates) {
      const parsed = Number(candidate);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }

    return 10;
  }

  _estimateBasePrice(distanceKm, durationMin) {
    const baseFare = 15000;
    const perKmRate = 5000;
    const perMinuteRate = 1000;
    return baseFare + (perKmRate * distanceKm) + (perMinuteRate * durationMin);
  }

  async requestTripFare(tripDetails = {}) {
    try {
      const tripId = tripDetails.tripId || tripDetails.id || `trip-${Date.now()}`;
      const distanceKm = this._extractDistanceKm(tripDetails);
      const durationMin = Number(tripDetails.durationMin || tripDetails.duration || 15);
      const demandFactor = Number(tripDetails.demandFactor ?? 1.0);
      const basePrice = this._estimateBasePrice(distanceKm, durationMin);

      const multiplierData = Number.isFinite(demandFactor) && demandFactor !== 1.0
        ? [{ adapterKey: 'ai_demand', multiplier: demandFactor, reason: 'Dynamic demand' }]
        : [];

      const quote = await this.generateQuoteUseCase.execute({
        tripRequestId: tripId,
        serviceType: tripDetails.serviceType || 'urban_taxi',
        scopeType: tripDetails.scopeType || 'City',
        scopeId: tripDetails.scopeId || 'default',
        distanceKm,
        durationMin,
        currencyId: tripDetails.currencyId || 'IRT',
        multiplierData,
      });

      return {
        success: true,
        finalPrice: quote.finalPrice ?? quote.totalPrice ?? basePrice,
        quoteId: quote.id,
      };
    } catch (error) {
      return {
        success: false,
        finalPrice: null,
        quoteId: null,
        error: error.message || 'Pricing service unavailable',
      };
    }
  }
}

module.exports = PricingServiceAdapter;
