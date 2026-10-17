'use strict';

/**
 * accept-offer.test.js - Mobility Engine (P13-2)
 *
 * تست واحد مسیر پذیرش سفر در جریان توزیع:
 *   - AcceptTripUseCase.acceptOffer: بررسی آفر → قفل SETNX → تغییر وضعیت
 *     (تراکنش) + ثبت رویداد TripAccepted در Outbox داخل همان تراکنش
 *   - TripRepository.updateTripStateAtomic: درج Outbox پیش از COMMIT
 *
 * ریپازیتوری آفرِ واقعی روی Redis ماک تست می‌شود تا معنای SETNX/EX واقعی باشد.
 */

const AcceptTripUseCase = require('../application/AcceptTripUseCase');
const TripRepository = require('../infrastructure/TripRepository');
const TripOfferRepository = require('../infrastructure/redis/TripOfferRepository');

function createMockRedis() {
  const store = new Map();
  return {
    store,
    async set(key, value, ...args) {
      if (args.includes('NX') && store.has(key)) return null;
      const ttl = args.includes('EX') ? args[args.indexOf('EX') + 1] : null;
      store.set(key, { value, ttl });
      return 'OK';
    },
    async get(key) {
      const entry = store.get(key);
      return entry ? entry.value : null;
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
  };
}

const UPDATED_TRIP = {
  id: 'trip-1',
  status: 'ACCEPTED',
  driver_id: 'drv-1',
  passenger_id: 'psg-1',
  origin_lat: 35.7,
  origin_lng: 51.4,
  dest_lat: 35.8,
  dest_lng: 51.5,
};

function makeTripRepository(overrides = {}) {
  return Object.assign({
    // Current lifecycle state is read before the atomic, row-locked update.
    getTripById: jest.fn().mockResolvedValue({ id: 'trip-1', status: 'REQUESTED' }),
    updateTripStateAtomic: jest.fn().mockResolvedValue(UPDATED_TRIP),
  }, overrides);
}

function makeUseCase({ redis = createMockRedis(), tripRepository = makeTripRepository(), events = [] } = {}) {
  const offerRepository = new TripOfferRepository({ redisClient: redis });
  const useCase = new AcceptTripUseCase({
    tripRepository,
    tripOfferRepository: offerRepository,
    emitEvent: (event, data) => events.push({ event, data }),
  });
  return { useCase, tripRepository, offerRepository, redis, events };
}

describe('P13-2: AcceptTripUseCase.acceptOffer', () => {
  test('valid offer + free lock → accepts trip and records TripAccepted in the outbox', async () => {
    const ctx = makeUseCase();
    await ctx.offerRepository.createOffer('trip-1', 'drv-1');

    const result = await ctx.useCase.acceptOffer({ tripId: 'trip-1', driverId: 'drv-1' });

    expect(result).toMatchObject({ tripId: 'trip-1', status: 'ACCEPTED', driverId: 'drv-1', passengerId: 'psg-1' });
    expect(result.offerStatus).toBe('PENDING');

    // وضعیت با تراکنش دیتابیس اتمیک تغییر کرده + رویداد در همان تراکنش ثبت شده
    expect(ctx.tripRepository.updateTripStateAtomic).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 'trip-1',
      expectedState: 'REQUESTED',
      targetState: 'ACCEPTED',
      driverId: 'drv-1',
      outboxEvent: {
        aggregateId: 'trip-1',
        eventType: 'TripAccepted',
        payload: { tripId: 'trip-1', driverId: 'drv-1' },
      },
    }));

    // رویداد درون‌فرآیندی برای مصرف‌کننده‌های فعلی
    expect(ctx.events).toEqual([{
      event: 'DriverAccepted',
      data: { tripId: 'trip-1', driverId: 'drv-1', passengerId: 'psg-1' },
    }]);

    // قفل پس از پذیرش موفق حفظ می‌شود (با TTL آزاد می‌شود)
    expect(ctx.redis.store.has('trip_lock:trip-1')).toBe(true);
  });

  test('expired or missing offer → 403 (راننده مجاز به پذیرش نیست)', async () => {
    const ctx = makeUseCase(); // هیچ آفری ساخته نشده است

    await expect(ctx.useCase.acceptOffer({ tripId: 'trip-1', driverId: 'drv-1' }))
      .rejects.toMatchObject({ statusCode: 403, code: 'UNAUTHORIZED_DISPATCH' });
    expect(ctx.tripRepository.updateTripStateAtomic).not.toHaveBeenCalled();
  });

  test('lock already held by another driver → 409 Conflict and the foreign lock stays', async () => {
    const ctx = makeUseCase();
    await ctx.offerRepository.createOffer('trip-1', 'drv-1');
    await ctx.offerRepository.lockTrip('trip-1', 'drv-2'); // راننده دیگر سریع‌تر بود

    await expect(ctx.useCase.acceptOffer({ tripId: 'trip-1', driverId: 'drv-1' }))
      .rejects.toMatchObject({
        statusCode: 409,
        // TripAlreadyAcceptedError در RideErrors.js نام مستعار RideAlreadyAcceptedError است
        // (کد دامنه کانونیکال RIDE_ALREADY_ACCEPTED) — قرارداد HTTP همان 409 Conflict است.
        code: 'RIDE_ALREADY_ACCEPTED',
      });

    expect(ctx.tripRepository.updateTripStateAtomic).not.toHaveBeenCalled();
    // قفل راننده برنده نباید آزاد شود
    expect(ctx.redis.store.get('trip_lock:trip-1').value).toBe('drv-2');
  });

  test('transactional failure releases the lock so a retry is possible', async () => {
    const repo = makeTripRepository({
      updateTripStateAtomic: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const ctx = makeUseCase({ tripRepository: repo });
    await ctx.offerRepository.createOffer('trip-1', 'drv-1');

    await expect(ctx.useCase.acceptOffer({ tripId: 'trip-1', driverId: 'drv-1' })).rejects.toThrow('db down');

    expect(ctx.redis.store.has('trip_lock:trip-1')).toBe(false);
    expect(ctx.events).toEqual([]);
  });

  test('validates its inputs and required dependency', async () => {
    const ctx = makeUseCase();
    await expect(ctx.useCase.acceptOffer({ tripId: 'trip-1' }))
      .rejects.toMatchObject({ statusCode: 400 });

    const bare = new AcceptTripUseCase({ tripRepository: makeTripRepository() });
    await expect(bare.acceptOffer({ tripId: 't', driverId: 'd' }))
      .rejects.toMatchObject({ statusCode: 500, code: 'OFFER_REPOSITORY_MISSING' });
  });
});

describe('P13-2: TripRepository — Outbox در همان تراکنش', () => {
  function makeDb(order) {
    const client = {
      query: jest.fn(async (sql) => {
        const normalized = String(sql).trim().split('\n')[0].trim().toUpperCase();
        order.push(normalized);
        if (normalized.startsWith('SELECT')) {
          // ردیف قفل‌شده در وضعیت موردانتظار (REQUESTED)
          return { rows: [{ ...UPDATED_TRIP, status: 'REQUESTED', driver_id: null }], rowCount: 1 };
        }
        return { rows: [UPDATED_TRIP], rowCount: 1 };
      }),
      release: jest.fn(),
    };
    return { db: { connect: jest.fn(async () => client), query: jest.fn() }, client };
  }

  test('inserts the outbox row with the same tx client, before COMMIT', async () => {
    const order = [];
    const { db, client } = makeDb(order);
    const outboxRepository = {
      insert: jest.fn(async () => { order.push('OUTBOX.INSERT'); return { id: 'evt-1' }; }),
    };
    const repo = new TripRepository(db, { outboxRepository });
    const outboxEvent = {
      aggregateId: 'trip-1',
      eventType: 'TripAccepted',
      payload: { tripId: 'trip-1', driverId: 'drv-1' },
    };

    const updated = await repo.updateTripStateAtomic({
      tripId: 'trip-1',
      expectedState: 'REQUESTED',
      targetState: 'ACCEPTED',
      driverId: 'drv-1',
      outboxEvent,
    });

    expect(updated.status).toBe('ACCEPTED');
    // همان کلاینت تراکنش → ثابت می‌کند درج Outbox داخل تراکنش وضعیت است
    expect(outboxRepository.insert).toHaveBeenCalledWith(outboxEvent, client);
    expect(order[0]).toBe('BEGIN');
    expect(order.indexOf('OUTBOX.INSERT')).toBeLessThan(order.indexOf('COMMIT'));
    expect(order[order.length - 1]).toBe('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });

  test('without outboxEvent the previous behaviour is preserved', async () => {
    const order = [];
    const { db } = makeDb(order);
    const outboxRepository = { insert: jest.fn() };
    const repo = new TripRepository(db, { outboxRepository });

    await repo.updateTripStateAtomic({
      tripId: 'trip-1', expectedState: 'REQUESTED', targetState: 'ACCEPTED', driverId: 'drv-1',
    });

    expect(outboxRepository.insert).not.toHaveBeenCalled();
    expect(order).toContain('COMMIT');
  });

  test('fails loudly (and rolls back) when outboxEvent is passed without an outboxRepository', async () => {
    const order = [];
    const { db, client } = makeDb(order);
    const repo = new TripRepository(db); // بدون outboxRepository

    await expect(repo.updateTripStateAtomic({
      tripId: 'trip-1',
      expectedState: 'REQUESTED',
      targetState: 'ACCEPTED',
      driverId: 'drv-1',
      outboxEvent: { aggregateId: 'trip-1', eventType: 'TripAccepted' },
    })).rejects.toThrow(/outboxRepository/);

    expect(order).toContain('ROLLBACK');
    expect(order).not.toContain('COMMIT');
    expect(client.release).toHaveBeenCalled();
  });
});