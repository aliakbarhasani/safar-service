'use strict';

/**
 * find-nearby-drivers.test.js - Mobility Engine (P13-1)
 *
 * تست واحد FindNearbyDriversUseCase موتور Mobility با آداپتر GEO ماک‌شده:
 *   - execute()      : مرتب‌سازی بر اساس فاصله + count/radius + اعتبارسنجی (400)
 *   - limit()        : برش لیست نتایج
 *   - findNearbyDrivers(): آداپتر سازگار با TripDispatchService
 */

const { FindNearbyDriversUseCase } = require('../application/FindNearbyDriversUseCase');

function fakeGeoRepository(drivers) {
  return { findNearbyDrivers: jest.fn().mockResolvedValue(drivers) };
}

describe('P13-1: Mobility FindNearbyDriversUseCase', () => {
  test('execute returns drivers sorted by distance with count and radius', async () => {
    const repo = fakeGeoRepository([
      { driverId: 'far', distance: 4.0 },
      { driverId: 'near', distance: 0.5 },
      { driverId: 'mid', distance: 2.1 },
    ]);
    const uc = new FindNearbyDriversUseCase({ geoRepository: repo });

    const out = await uc.execute({ lon: 51.389, lat: 35.6892, radiusKm: 4 });

    expect(repo.findNearbyDrivers).toHaveBeenCalledWith(51.389, 35.6892, 4);
    expect(out.count).toBe(3);
    expect(out.radiusKm).toBe(4);
    expect(out.drivers.map((d) => d.driverId)).toEqual(['near', 'mid', 'far']);
  });

  test('execute honours limit and rejects invalid limit', async () => {
    const repo = fakeGeoRepository([
      { driverId: 'a', distance: 1 },
      { driverId: 'b', distance: 2 },
      { driverId: 'c', distance: 3 },
    ]);
    const uc = new FindNearbyDriversUseCase({ geoRepository: repo });

    const out = await uc.execute({ lon: 51.389, lat: 35.6892, limit: 2 });
    expect(out.count).toBe(2);
    expect(out.drivers.map((d) => d.driverId)).toEqual(['a', 'b']);

    await expect(uc.execute({ lon: 51.389, lat: 35.6892, limit: 0 }))
      .rejects.toMatchObject({ statusCode: 400 });
  });

  test('findNearbyDrivers facade matches TripDispatchService contract', async () => {
    const repo = fakeGeoRepository([
      { driverId: 'd2', distance: 2.7 },
      { driverId: 'd1', distance: 0.9 },
    ]);
    const uc = new FindNearbyDriversUseCase({ geoRepository: repo });

    const drivers = await uc.findNearbyDrivers(51.389, 35.6892, 3);

    expect(repo.findNearbyDrivers).toHaveBeenCalledWith(51.389, 35.6892, 3);
    expect(Array.isArray(drivers)).toBe(true);
    expect(drivers[0].driverId).toBe('d1');
    expect(drivers[1].driverId).toBe('d2');
  });

  test('rejects invalid coordinates and radius with 400', async () => {
    const uc = new FindNearbyDriversUseCase({ geoRepository: fakeGeoRepository([]) });

    await expect(uc.execute({ lon: 'x', lat: 35 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(uc.execute({ lon: 51, lat: undefined })).rejects.toMatchObject({ statusCode: 400 });
    await expect(uc.execute({ lon: 51, lat: 35, radiusKm: 999 })).rejects.toMatchObject({ statusCode: 400 });
    await expect(uc.execute({ lon: 51, lat: 35, radiusKm: 0 })).rejects.toMatchObject({ statusCode: 400 });
  });

  test('requires a geoRepository with findNearbyDrivers()', () => {
    expect(() => new FindNearbyDriversUseCase({})).toThrow('requires a geoRepository');
    expect(() => new FindNearbyDriversUseCase({ geoRepository: {} })).toThrow('requires a geoRepository');
  });

  test('uses default radius (5km) when radiusKm is omitted', async () => {
    const repo = fakeGeoRepository([]);
    const uc = new FindNearbyDriversUseCase({ geoRepository: repo });

    const out = await uc.execute({ lon: 51.389, lat: 35.6892 });

    expect(repo.findNearbyDrivers).toHaveBeenCalledWith(51.389, 35.6892, 5);
    expect(out.radiusKm).toBe(5);
    expect(out.count).toBe(0);
  });
});
