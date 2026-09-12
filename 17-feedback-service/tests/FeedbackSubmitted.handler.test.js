/**
 * FeedbackSubmitted.handler.test.js - Trust-score aggregation tests (P5-2)
 *
 * Verifies the moving-average math and the atomic users-table update:
 *   new_rating = ((old_rating * total_reviews) + new_rating) / (total_reviews + 1)
 *
 * The prompt's example: a user with 5 reviews and an average of 4.0 who
 * receives a 5.0 — average = (4.0*5 + 5) / 6 = 25/6 ≈ 4.1667 (≈ 4.17 at 2
 * decimal places; the DB ROUND applies on write).
 */

const { EventEmitter } = require('events');
const {
  FeedbackSubmittedHandler,
  computeNewRating,
  FEEDBACK_EVENT,
} = require('../../03-user-service/handlers/FeedbackSubmitted.handler');

describe('FeedbackSubmittedHandler (P5-2 trust aggregation)', () => {
  test('moving-average formula: (4.0*5 + 5) / 6 = 25/6 ≈ 4.1667', () => {
    const result = computeNewRating(4.0, 5, 5);
    expect(result).toBeCloseTo(25 / 6, 8); // 4.16666...
    expect(result).toBeGreaterThan(4.0);   // score actually rises
  });

  test('first review seeds rating from scratch', () => {
    expect(computeNewRating(null, 0, 5)).toBeCloseTo(5, 8);
    expect(computeNewRating(0, 0, 3)).toBeCloseTo(3, 8);
  });

  test('runs the atomic UPDATE and returns the new score', async () => {
    const fakePool = {
      query: jest.fn(async () => ({ rows: [{ rating: '4.17', total_reviews: '6' }] })),
    };
    const bus = new EventEmitter();
    const handler = new FeedbackSubmittedHandler({ eventBus: bus, pool: fakePool });

    const res = await handler.handle({
      event: 'FeedbackSubmitted',
      data: { revieweeId: 'user-driver', rating: 5, tripId: 'trip-1' },
    });

    expect(res).toMatchObject({ updated: true, newRating: 4.17, totalReviews: 6 });
    expect(fakePool.query).toHaveBeenCalledTimes(1);
    const [sql, params] = fakePool.query.mock.calls[0];
    expect(sql).toContain('UPDATE users');
    expect(sql).toContain('total_reviews = total_reviews + 1');
    expect(params).toEqual(['user-driver', 5]);
  });

  test('ignores invalid or out-of-range ratings without touching the DB', async () => {
    const fakePool = { query: jest.fn() };
    const handler = new FeedbackSubmittedHandler({ eventBus: new EventEmitter(), pool: fakePool });

    for (const bad of [{ revieweeId: 'u1', rating: 7 }, { revieweeId: 'u1' }, { revieweeId: '', rating: 3 }]) {
      const res = await handler.handle({ event: 'FeedbackSubmitted', data: bad });
      expect(res.updated).toBe(false);
    }
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  test('subscribes to FeedbackSubmitted on register()', () => {
    const bus = new EventEmitter();
    const spy = jest.spyOn(bus, 'on');
    new FeedbackSubmittedHandler({ eventBus: bus, pool: {} }).register();
    expect(spy).toHaveBeenCalledWith(FEEDBACK_EVENT, expect.any(Function));
  });
});