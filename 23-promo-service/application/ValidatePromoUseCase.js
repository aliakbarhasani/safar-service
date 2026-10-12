'use strict';

const crypto = require('crypto');

const LOCK_TTL_SECONDS = 10;
const LOCK_PREFIX = 'lock:promo';
const RELEASE_LOCK_SCRIPT = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

class PromoValidationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PromoValidationError';
    this.code = code;
  }
}

function computeDiscount(type, value, fare, maxDiscountAmount) {
  let discount = 0;
  if (type === 'PERCENTAGE') {
    discount = fare * (value / 100);
    if (maxDiscountAmount != null && discount > maxDiscountAmount) {
      discount = maxDiscountAmount;
    }
  } else {
    discount = value;
  }
  if (discount > fare) discount = fare;
  return Math.round(discount);
}

class ValidatePromoUseCase {
  constructor({ promoCodeModel, promoUsageModel, redisClient }) {
    this.promoCodeModel = promoCodeModel;
    this.promoUsageModel = promoUsageModel;
    this.redis = redisClient;
  }

  async execute({ code, userId, fare }) {
    if (!code) throw new PromoValidationError('Promo code is required', 'MISSING_CODE');
    if (!userId) throw new PromoValidationError('Authenticated user is required', 'MISSING_USER');
    if (fare == null || !Number.isFinite(Number(fare)) || Number(fare) < 0) {
      throw new PromoValidationError('Valid fare is required', 'INVALID_FARE');
    }

    const promo = await this.promoCodeModel.findByCode(code);
    if (!promo) throw new PromoValidationError('Promo code not found', 'NOT_FOUND');
    if (!promo.is_active) throw new PromoValidationError('Promo code is inactive', 'INACTIVE');
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      throw new PromoValidationError('Promo code has expired', 'EXPIRED');
    }

    // Fail closed: discounts must never be issued when the distributed lock
    // cannot be acquired or safely released.
    const lockKey = `${LOCK_PREFIX}:${code}:user:${userId}`;
    const lockToken = crypto.randomUUID();
    if (!this.redis || typeof this.redis.set !== 'function' || typeof this.redis.eval !== 'function') {
      throw new PromoValidationError('Promo validation is temporarily unavailable', 'LOCK_UNAVAILABLE');
    }

    let lockAcquired = false;
    try {
      const result = await this.redis.set(lockKey, lockToken, 'NX', 'EX', LOCK_TTL_SECONDS);
      lockAcquired = result === 'OK';
    } catch (error) {
      throw new PromoValidationError('Promo validation is temporarily unavailable', 'LOCK_UNAVAILABLE');
    }

    if (!lockAcquired) {
      throw new PromoValidationError('Concurrent validation in progress', 'CONCURRENT_REQUEST');
    }

    try {
      // Check global usage limit
      if (promo.global_max_uses > 0 && promo.current_uses >= promo.global_max_uses) {
        throw new PromoValidationError('Promo code usage limit reached', 'GLOBAL_LIMIT_REACHED');
      }

      // Check per-user usage limit
      const userUsageCount = await this.promoUsageModel
        ? await this.promoUsageModel.countUserUsages(code, userId)
        : await this.promoCodeModel.countUserUsages(code, userId);

      if (userUsageCount >= promo.max_uses_per_user) {
        throw new PromoValidationError('User promo usage limit reached', 'USER_LIMIT_REACHED');
      }

      const discountAmount = computeDiscount(promo.type, promo.value, fare, promo.max_discount_amount);
      const finalFare = fare - discountAmount;

      return {
        valid: true,
        code: promo.code,
        type: promo.type,
        value: promo.value,
        discountAmount,
        originalFare: fare,
        finalFare,
      };
    } finally {
      // Compare-and-delete prevents an expired/reacquired lock from being
      // deleted by the request that originally held it.
      if (lockAcquired) {
        try {
          await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, lockToken);
        } catch (error) {
          // The TTL is the safe fallback if Redis cannot release the owned lock.
        }
      }
    }
  }
}

module.exports = { ValidatePromoUseCase, PromoValidationError, computeDiscount };
