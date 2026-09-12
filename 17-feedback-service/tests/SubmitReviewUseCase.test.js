/**
 * SubmitReviewUseCase.test.js - Integration-style test (Feedback Service, P5-2)
 *
 * Verifies the review-submission contract:
 *   • rating integer must be in [1, 5];
 *   • duplicate reviews for the same trip are rejected;
 *   • only completed trips may be reviewed;
 *   • only a participant (passenger/driver) of the trip may review;
 *   • the reviewee is inferred as the other participant;
 *   • a `FeedbackSubmitted` event { revieweeId, rating, tripId } is published.
 */

const { SubmitReviewUseCase, REVIEW_CREATED_EVENT } = require('../application/SubmitReviewUseCase');

function makeReviewRepository() {
  return {
    findByTripAndReviewer: jest.fn(async () => null),
    create: jest.fn(async (r) => ({ id: 'rev-1', ...r })),
    constructor: { isDuplicateError: (err) => !!err && err.code === '23505' },
  };
}

function makeTripLookup(trip = null) {
  return { getById: jest.fn(async () => trip) };
}

function setup({ trip, preExisting = null, createError = null } = {}) {
  const reviewRepository = makeReviewRepository();
  reviewRepository.findByTripAndReviewer.mockResolvedValue(preExisting);
  reviewRepository.create.mockImplementation(async (r) => {
    if (createError) throw createError;
    return { id: 'rev-1', ...r };
  });
  const tripLookup = makeTripLookup(trip);
  const emitted = [];
  const uc = new SubmitReviewUseCase({
    reviewRepository,
    tripLookup,
    emitEvent: (event, data) => emitted.push({ event, data }),
  });
  return { reviewRepository, tripLookup, emitted, uc };
}

const COMPLETED_TRIP = (passengerId, driverId) => ({
  id: 'trip-1',
  passenger_id: passengerId,
  driver_id: driverId,
  lifecycle_status: 'COMPLETED',
  status: 'COMPLETED',
});

describe('SubmitReviewUseCase (P5-2)', () => {
  test('rejects out-of-range and non-integer ratings', async () => {
    const ctx = setup({ trip: COMPLETED_TRIP('p1', 'd1') });
    for (const rating of [0, 6, 1.5, -1, 'abc']) {
      await expect(ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'p1', rating }))
        .rejects.toMatchObject({ code: 'REVIEW_RATING_INVALID', statusCode: 400 });
    }
  });

  test('rejects a duplicate review for the same trip', async () => {
    const ctx = setup({ trip: COMPLETED_TRIP('p1', 'd1'), preExisting: { id: 'rev-x' } });
    await expect(ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'p1', rating: 5 }))
      .rejects.toMatchObject({ code: 'REVIEW_DUPLICATE', statusCode: 409 });
    expect(ctx.reviewRepository.create).not.toHaveBeenCalled();
  });

  test('rejects review when the trip does not exist', async () => {
    const ctx = setup({ trip: null });
    await expect(ctx.uc.execute({ tripId: 'missing', reviewerId: 'p1', rating: 5 }))
      .rejects.toMatchObject({ code: 'REVIEW_TRIP_NOT_FOUND', statusCode: 404 });
  });

  test('rejects review when the trip is not completed', async () => {
    const ctx = setup({ trip: { id: 't1', passenger_id: 'p1', driver_id: 'd1', lifecycle_status: 'IN_PROGRESS' } });
    await expect(ctx.uc.execute({ tripId: 't1', reviewerId: 'p1', rating: 5 }))
      .rejects.toMatchObject({ code: 'REVIEW_TRIP_NOT_COMPLETED', statusCode: 409 });
  });

  test('rejects review by an outsider (not a participant)', async () => {
    const ctx = setup({ trip: COMPLETED_TRIP('p1', 'd1') });
    await expect(ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'stranger', rating: 5 }))
      .rejects.toMatchObject({ code: 'REVIEW_NOT_PARTICIPANT', statusCode: 403 });
  });

  test('passenger reviews driver: reviewee is the driver, event emitted', async () => {
    const ctx = setup({ trip: COMPLETED_TRIP('p1', 'd1') });
    const result = await ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'p1', rating: 5, comment: '  good ride  ' });

    expect(result).toMatchObject({ reviewId: 'rev-1', reviewerId: 'p1', revieweeId: 'd1', rating: 5, comment: 'good ride' });
    expect(ctx.reviewRepository.create).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 'trip-1', reviewerId: 'p1', revieweeId: 'd1', rating: 5,
    }));
    expect(ctx.emitted).toHaveLength(1);
    expect(ctx.emitted[0].event).toBe(REVIEW_CREATED_EVENT);
    expect(ctx.emitted[0].data).toEqual({ revieweeId: 'd1', rating: 5, tripId: 'trip-1' });
  });

  test('driver reviews passenger: reviewee is the passenger', async () => {
    const ctx = setup({ trip: COMPLETED_TRIP('p1', 'd1') });
    const result = await ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'd1', rating: 4 });
    expect(result.revieweeId).toBe('p1');
    expect(ctx.emitted[0].data).toEqual({ revieweeId: 'p1', rating: 4, tripId: 'trip-1' });
  });

  test('maps a concurrency unique-violation to REVIEW_DUPLICATE', async () => {
    const ctx = setup({
      trip: COMPLETED_TRIP('p1', 'd1'),
      createError: Object.assign(new Error('duplicate key'), { code: '23505' }),
    });
    await expect(ctx.uc.execute({ tripId: 'trip-1', reviewerId: 'p1', rating: 5 }))
      .rejects.toMatchObject({ code: 'REVIEW_DUPLICATE', statusCode: 409 });
  });
});