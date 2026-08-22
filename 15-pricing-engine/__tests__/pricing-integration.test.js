const assert = require('assert');

const { PricingController } = require('../presentation');
const { PostgresPricingRepository } = require('../infrastructure');
const { GeneratePriceQuote } = require('../application/useCases');
const { IRuleResolver, IPricingEventPublisher, ICacheProvider, PricingRule } = require('../domain');

function createMockUseCase() {
  const ruleResolver = new IRuleResolver();
  ruleResolver.resolve = async () => new PricingRule({
    priority: 50,
    scopeType: 'City',
    scopeId: 'default',
    serviceType: 'urban_taxi',
    currencyId: 'IRT',
    baseFare: 15000,
    perKmRate: 5000,
    perMinuteRate: 1000,
  });

  const eventPublisher = new IPricingEventPublisher();
  eventPublisher.publishQuoteGenerated = async () => {};

  const cacheProvider = new ICacheProvider();
  cacheProvider.get = async () => null;
  cacheProvider.set = async () => {};

  return new GeneratePriceQuote({
    ruleResolver,
    eventPublisher,
    cacheProvider,
    config: {},
  });
}

describe('Pricing Engine - integration (controller + repository fallback)', () => {
  test('controller.createQuote returns 201 with a valid payload', async () => {
    const controller = new PricingController({ generateQuote: createMockUseCase() });

    const req = {
      body: {
        tripId: 'trip-integration-001',
        distanceKm: 10,
        durationMin: 15,
        demandFactor: 1.2,
      },
    };

    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };

    await controller.createQuote(req, res);

    assert.strictEqual(res.statusCode, 201, 'Controller should return HTTP 201');
    assert.strictEqual(res.body.success, true, 'Controller should return success payload');
    assert.ok(res.body.data, 'Controller should include quote data');
  });

  test('repository.saveQuote falls back to in-memory storage when DB is unreachable', async () => {
    const repo = new PostgresPricingRepository();
    repo.dbPool = {
      query: async () => {
        throw Object.assign(new Error('ECONNREFUSED'), { code: 'ECONNREFUSED' });
      },
    };

    const savedQuote = await repo.saveQuote({
      tripRequestId: 'fallback-test',
      totalPrice: 15000,
      currencyId: 'IRT',
      status: 'ACTIVE',
    });

    assert.ok(savedQuote.id, 'Repository should save quote to fallback storage');
    assert.ok(repo._memoryStore instanceof Map, 'Repository should activate the in-memory fallback Map');
    assert.strictEqual(repo._memoryStore.get(savedQuote.id).id, savedQuote.id);
  });
});
