/**
 * SubmitReviewUseCase - Application Layer (Feedback Service, P5-2)
 *
 * Validates and persists a new review for a completed trip, then emits the
 * `FeedbackSubmitted` domain event so downstream trust-score aggregators
 * (FeedbackSubmitted.handler in the user profile bounded-context) can update
 * the reviewee's moving-average rating.
 *
 * Validations:
 *   • rating is an integer in [1, 5];
 *   • no duplicate review for the same (trip, reviewer);
 *   • the trip exists and is in COMPLETED state;
 *   • the reviewer is a participant (passenger or driver) of that trip —
 *     outsiders cannot review trips they were not part of;
 *   • the reviewee is inferred to be the other participant.
 */

const REVIEW_CREATED_EVENT = 'FeedbackSubmitted';

/** Build a typed domain error. */
function createError(code, statusCode, message) {
  const err = new Error(message);
  err.code = code;
  err.statusCode = statusCode;
  return err;
}

class SubmitReviewUseCase {
  /**
   * @param {Object} deps
   * @param {import('../models/review.model').ReviewRepository} deps.reviewRepository
   * @param {import('../infrastructure/TripLookup').TripLookup} deps.tripLookup
   * @param {Function} [deps.emitEvent]
   */
  constructor({ reviewRepository, tripLookup, emitEvent = null }) {
    this.reviewRepository = reviewRepository;
    this.tripLookup = tripLookup;
    this.emitEvent = typeof emitEvent === 'function' ? emitEvent : () => {};
  }

  async execute({ tripId, reviewerId, rating, comment = null }) {
    // --- 1) basic required fields ---
    if (!tripId || !reviewerId) {
      throw createError('REVIEW_VALIDATION', 400, 'tripId و reviewerId الزامی هستند.');
    }

    // --- 2) rating must be an integer in [1, 5] ---
    const numericRating = Number(rating);
    if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
      throw createError('REVIEW_RATING_INVALID', 400, 'امتیاز باید یک عدد صحیح بین ۱ تا ۵ باشد.');
    }

    // --- 3) prevent duplicate review for the same trip by this reviewer ---
    const existing = await this.reviewRepository.findByTripAndReviewer(tripId, reviewerId);
    if (existing) {
      throw createError('REVIEW_DUPLICATE', 409, 'شما قبلاً برای این سفر نظر ثبت کرده‌اید.');
    }

    // --- 4) trip must exist and be COMPLETED ---
    const trip = await this.tripLookup.getById(tripId);
    if (!trip) {
      throw createError('REVIEW_TRIP_NOT_FOUND', 404, 'سفری با این شناسه یافت نشد.');
    }
    const tripStatus = String(trip.lifecycle_status || trip.status || '').toUpperCase();
    if (tripStatus !== 'COMPLETED') {
      throw createError('REVIEW_TRIP_NOT_COMPLETED', 409, 'فقط سفرهای تکمیل‌شده قابلیت نظردهی دارند.');
    }

    // --- 5) reviewer must be a participant; reviewee is the other party ---
    let revieweeId;
    if (String(trip.passenger_id) === String(reviewerId)) {
      revieweeId = trip.driver_id;
    } else if (String(trip.driver_id) === String(reviewerId)) {
      revieweeId = trip.passenger_id;
    } else {
      throw createError('REVIEW_NOT_PARTICIPANT', 403, 'فقط مسافر یا راننده همان سفر می‌تواند نظر ثبت کند.');
    }
    if (!revieweeId) {
      throw createError('REVIEW_REVIEWEE_MISSING', 422, 'طرف مقابل سفر برای دریافت نظر مشخص نیست.');
    }

    // --- 6) persist (unique constraint is a final concurrency-safe guard) ---
    let review;
    try {
      review = await this.reviewRepository.create({
        tripId,
        reviewerId,
        revieweeId,
        rating: numericRating,
        comment: comment && String(comment).trim() ? String(comment).trim() : null,
      });
    } catch (err) {
      if (this.reviewRepository.constructor.isDuplicateError(err)) {
        throw createError('REVIEW_DUPLICATE', 409, 'شما قبلاً برای این سفر نظر ثبت کرده‌اید.');
      }
      throw err;
    }

    // --- 7) publish the domain event (fire-and-forget downstream) ---
    this.emitEvent(REVIEW_CREATED_EVENT, {
      revieweeId,
      rating: numericRating,
      tripId,
    });

    return {
      reviewId: review.id,
      tripId,
      reviewerId,
      revieweeId,
      rating: numericRating,
      comment: review.comment || null,
    };
  }
}

SubmitReviewUseCase.EVENT = REVIEW_CREATED_EVENT;

module.exports = { SubmitReviewUseCase, REVIEW_CREATED_EVENT };