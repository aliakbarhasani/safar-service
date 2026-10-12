/**
 * CalculateFareUseCase.test.js - Unit tests (P6-1)
 *
 * Verifies base-price formula, surge application, clamping and validation
 * using a stubbed DemandSupplyTracker (no live Redis needed).
 */

const {
  CalculateFareUseCase,
  computeSurge,
  haversineKm,
  MAX_SURGE,
  SURGE_FLOOR,
} = require('../application/CalculateFareUseCase');

function stubTracker(ratio) {
  return {
    // eslint-disable-next-line no-unused-vars
    async getSupplyAndDemand(_geohash, _opts) {
      return { geohash: 'stub', demand: 10, supply: 5, ratio };
    },
  };
}

// Tehran: Azadi Sq -> Enghelab Sq (~4-5 km)
const TEHRAN_A = { originLat: 35.6997, originLng: 51.3378, destLat: 35.7012, destLng: 51.3900 };

describe('CalculateFareUseCase (P6-1)', () => {
  test('no surge when ratio <= 1 (multiplier = 1.0)', async () => {
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(0.5) });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 2000, baseFare: 15000 });
    expect(res.surgeMultiplier).toBe(1.0);
    const expectedBase = Math.round(res.distance * 2000 + 15000);
    expect(res.estimatedFare).toBe(expectedBase);
    expect(res.distance).toBeGreaterThan(0);
    expect(typeof res.geohash).toBe('string');
    expect(res.geohash).toHaveLength(5);
  });

  test('uses the configured base fare when no dynamic config store is injected', async () => {
    const config = require('../../14-config-system/server.config');
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(0) });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 0 });
    expect(res.estimatedFare).toBe(Math.round(config.trip.baseFare));
  });

  test('rejects negative dynamic fare configuration instead of calculating a negative fare', async () => {
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      dynamicConfigStore: { getConfig: async (key, fallback) => key === 'trip.perKmRate' ? -1 : fallback },
    });
    await expect(uc.execute({ ...TEHRAN_A }))
      .rejects.toMatchObject({ statusCode: 503, code: 'FARE_CONFIG_INVALID' });
  });

  test('preserves a zero base fare from dynamic configuration', async () => {
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      dynamicConfigStore: { getConfig: async (key, fallback) => key === 'trip.baseFare' ? 0 : fallback },
    });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 1000 });
    expect(res.estimatedFare).toBe(Math.round(res.distance * 1000));
  });

  test('surge ratio 1.5 is applied to final fare', async () => {
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(1.5) });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 2000, baseFare: 15000 });
    expect(res.surgeMultiplier).toBe(1.5);
    const expectedBase = res.distance * 2000 + 15000;
    expect(res.estimatedFare).toBe(Math.round(expectedBase * 1.5));
  });

  test('surge is clamped to MAX_SURGE (2.0)', async () => {
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(5) });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 2000, baseFare: 15000 });
    expect(res.surgeMultiplier).toBe(MAX_SURGE);
    expect(res.surgeMultiplier).toBe(2.0);
  });

  test('surge just above 1 is floored to 1.1', async () => {
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(1.02) });
    const res = await uc.execute({ ...TEHRAN_A, perKmRate: 2000, baseFare: 15000 });
    expect(res.surgeMultiplier).toBe(SURGE_FLOOR);
  });

  test('invalid coordinates throw 400', async () => {
    const uc = new CalculateFareUseCase({ demandSupplyTracker: stubTracker(0) });
    await expect(uc.execute({ originLat: NaN, originLng: 51, destLat: 35, destLng: 51 }))
      .rejects.toMatchObject({ statusCode: 400, code: 'FARE_INVALID_COORDS' });
  });

  test('fails closed when quote storage is configured without the required SQL persistence', async () => {
    const fareQuoteStore = { ttlSeconds: 300, save: jest.fn() };
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      fareQuoteStore,
    });

    await expect(uc.execute({ ...TEHRAN_A }))
      .rejects.toMatchObject({ statusCode: 503, code: 'FARE_QUOTE_PERSISTENCE_UNAVAILABLE' });
    expect(fareQuoteStore.save).not.toHaveBeenCalled();
  });

  test('does not return a usable estimate when SQL quote persistence fails', async () => {
    const fareQuoteStore = { ttlSeconds: 300, save: jest.fn() };
    const pricingRepository = {
      saveFareQuote: jest.fn(async () => { throw new Error('database credentials leaked only to logs'); }),
    };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      fareQuoteStore,
      pricingRepository,
    });

    try {
      await expect(uc.execute({ ...TEHRAN_A }))
        .rejects.toMatchObject({ statusCode: 503, code: 'FARE_QUOTE_PERSISTENCE_FAILED' });
      expect(fareQuoteStore.save).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('does not return a usable estimate when Redis quote persistence fails', async () => {
    const fareQuoteStore = {
      ttlSeconds: 300,
      save: jest.fn(async () => { throw new Error('redis unavailable'); }),
    };
    const pricingRepository = { saveFareQuote: jest.fn(async () => 'quote-1') };
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      fareQuoteStore,
      pricingRepository,
    });

    try {
      await expect(uc.execute({ ...TEHRAN_A }))
        .rejects.toMatchObject({ statusCode: 503, code: 'FARE_QUOTE_PERSISTENCE_FAILED' });
      expect(pricingRepository.saveFareQuote).toHaveBeenCalledTimes(1);
    } finally {
      warnSpy.mockRestore();
    }
  });

  test('requires an authenticated user before accepting a promo code', async () => {
    const promoService = { execute: jest.fn() };
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      promoService,
    });
    await expect(uc.execute({ ...TEHRAN_A, promoCode: 'SAVE10' }))
      .rejects.toMatchObject({ statusCode: 401, code: 'PROMO_AUTH_REQUIRED' });
    expect(promoService.execute).not.toHaveBeenCalled();
  });

  test('fails closed for authenticated promo requests when no durable discount lifecycle exists', async () => {
    const promoService = {
      execute: jest.fn(async () => ({
        valid: true,
        code: 'SAVE10',
        discountAmount: 500,
        finalFare: 100,
      })),
    };
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      promoService,
    });

    await expect(uc.execute({
      ...TEHRAN_A,
      promoCode: 'SAVE10',
      userId: 'user-1',
    })).rejects.toMatchObject({ statusCode: 503, code: 'PROMO_QUOTE_UNSUPPORTED' });
    expect(promoService.execute).not.toHaveBeenCalled();
  });

  test('does not discount a protected quote until promo data is persisted atomically', async () => {
    const promoService = { execute: jest.fn() };
    const fareQuoteStore = { ttlSeconds: 300, save: jest.fn() };
    const uc = new CalculateFareUseCase({
      demandSupplyTracker: stubTracker(0),
      fareQuoteStore,
      promoService,
    });
    await expect(uc.execute({
      ...TEHRAN_A,
      promoCode: 'SAVE10',
      userId: 'user-1',
    })).rejects.toMatchObject({ statusCode: 503, code: 'PROMO_QUOTE_UNSUPPORTED' });
    expect(promoService.execute).not.toHaveBeenCalled();
    expect(fareQuoteStore.save).not.toHaveBeenCalled();
  });

  test('computeSurge / haversineKm pure helpers', () => {
    expect(computeSurge(0.9)).toBe(1.0);
    expect(computeSurge(1)).toBe(1.0);
    expect(computeSurge(1.5)).toBe(1.5);
    expect(computeSurge(99)).toBe(2.0);
    const d = haversineKm(35.6997, 51.3378, 35.7012, 51.39);
    expect(d).toBeGreaterThan(1);
    expect(d).toBeLessThan(15);
  });
});
