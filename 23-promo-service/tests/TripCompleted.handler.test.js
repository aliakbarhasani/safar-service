'use strict';

const { TripCompletedHandler } = require('../handlers/TripCompleted.handler');

describe('TripCompletedHandler idempotency', () => {
  test('records a promo usage and increments the counter only once for duplicate trip events', async () => {
    let usageExists = false;
    let usageInsertCount = 0;
    let promoIncrementCount = 0;
    const client = {
      query: jest.fn(async (sql) => {
        if (sql === 'SELECT id FROM promo_usages WHERE trip_id = $1 LIMIT 1') {
          return { rows: usageExists ? [{ id: 'usage-1' }] : [], rowCount: usageExists ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO promo_usages')) {
          usageExists = true;
          usageInsertCount += 1;
          return { rows: [{ id: 'usage-1' }], rowCount: 1 };
        }
        if (sql.startsWith('UPDATE promo_codes')) {
          promoIncrementCount += 1;
          return { rows: [{ code: 'SAVE10' }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      }),
      release: jest.fn(),
    };
    const pool = { connect: jest.fn(async () => client) };
    const handler = new TripCompletedHandler({ pool });

    const payload = { tripId: '11111111-1111-1111-1111-111111111111', passengerId: '22222222-2222-2222-2222-222222222222', promoCode: 'SAVE10' };
    const first = await handler.handle(payload);
    const second = await handler.handle(payload);

    expect(first).toMatchObject({ consumed: true, tripId: payload.tripId });
    expect(second).toMatchObject({ consumed: false, duplicate: true, tripId: payload.tripId });
    expect(usageInsertCount).toBe(1);
    expect(promoIncrementCount).toBe(1);
    expect(client.query).toHaveBeenCalledWith('SELECT pg_advisory_xact_lock(hashtext($1))', [payload.tripId]);
    expect(client.query).toHaveBeenCalledTimes(10);
    expect(client.release).toHaveBeenCalledTimes(2);
  });
});
