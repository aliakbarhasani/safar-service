'use strict';

/**
 * ValidatePromoUseCase.test.js - Promo Service (P10-2)
 *
 * اعتبارسنجی الگوی قفل توزیع‌شده (Distributed Lock) در اعتبارسنجی کد تخفیف:
 * - تست همزانی: دو درخواست همزمان برای یک کاربر/کد — اولین قفل را می‌گیرد،
 *   دومی با خطای CONCURRENT_REQUEST شکست می‌خورد.
 * - محاسبه تخفیف (Percentage + سقف max_discount_amount).
 * - اعتبارسنجی ورودی‌ها (کد موجود نباشد، منقضی، inactive و ...).
 */

const { ValidatePromoUseCase, PromoValidationError } = require('../application/ValidatePromoUseCase');

function makePromoCodeModel(overrides = {}) {
  const basePromo = {
    code: 'SAVE10',
    type: 'PERCENTAGE',
    value: 10,
    max_discount_amount: 5000,
    max_uses_per_user: 1,
    global_max_uses: 0,
    current_uses: 0,
    expires_at: new Date(Date.now() + 86400 * 1000).toISOString(),
    is_active: true,
  };
  return {
    findByCode: async () => Object.assign({}, basePromo, overrides),
    countUserUsages: async () => 0,
  };
}

/**
 * کلاینت Redis ماک‌شده با پشتیبانی SET NX EX true — شبیه‌سازی قفل توزیع‌شده.
 *
 * - `preHeld`  : کلیدها/کلیدِ قفلی که از قبل گرفته‌شده‌اند (شبیه‌سازی قفلِ در
 *                اختیار یک تراکنش/درخواستِ همزمانِ دیگر پیش از این فراخوانی).
 * - `delDelay` : تاخیر (ms) در آزادسازی قفل (DEL) برای شبیه‌سازی همزانی واقعی:
 *                تا پایان تاخیر، فراخوانی موازیِ همزمان قفل را «نمی‌بیند» و در
 *                نتیجه با CONCURRENT_REQUEST رد می‌شود.
 */
function makeMockRedis({ preHeld = null, delDelay = 0 } = {}) {
  const held = new Map();
  const redis = {
    held,
    set: async (key, token) => {
      if (held.has(key)) return null;
      held.set(key, token);
      return 'OK';
    },
    eval: async (_script, _numKeys, key, token) => {
      if (delDelay > 0) await new Promise((resolve) => setTimeout(resolve, delDelay));
      if (held.get(key) !== token) return 0;
      held.delete(key);
      return 1;
    },
  };
  if (preHeld) {
    if (Array.isArray(preHeld)) preHeld.forEach((k) => held.set(k, 'another-owner'));
    else held.set(preHeld, 'another-owner');
  }
  return redis;
}

function assert(cond, msg) { if (!cond) throw new Error(`ASSERT FAILED: ${msg}`); }

let passed = 0;
const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

// ---------- تست‌ها ----------

test('ACEITA: percentage discount without exceeding max', async () => {
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel({ max_discount_amount: null }),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: makeMockRedis(),
  });
  const r = await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 100000 });
  assert(r.valid === true, 'valid should be true');
  assert(r.discountAmount === 10000, `discount should be 10000 (10% of 100k), got ${r.discountAmount}`);
  assert(r.finalFare === 90000, `finalFare should be 90000, got ${r.finalFare}`);
  passed++;
});

test('ACEITA: discount capped by max_discount_amount', async () => {
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel({ value: 50, max_discount_amount: 5000 }),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: makeMockRedis(),
  });
  const r = await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 100000 });
  assert(r.discountAmount === 5000, `discount should be capped at 5000, got ${r.discountAmount}`);
  passed++;
});

test('CONCURRENCY: request rejected while lock already held by another request (same user/code)', async () => {
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: makeMockRedis({ preHeld: 'lock:promo:SAVE10:user:u1' }),
  });
  // قفل از قبل در اختیار درخواستِ همزمانِ دیگری است → این فراخوانی باید شکست بخورد
  try {
    await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 100000 });
    throw new Error('expected CONCURRENT_REQUEST but succeeded');
  } catch (err) {
    assert(err instanceof PromoValidationError, 'should be PromoValidationError');
    assert(err.code === 'CONCURRENT_REQUEST', `code=${err.code}`);
  }
  passed++;
});

test('CONCURRENCY: exactly one of two simultaneous calls succeeds, other rejected', async () => {
  // delDelay باعث میشود آزادسازی قفلِ برنده به تاخیر بیفتد؛ در نتیجه درخواستِ
  // همزمانِ دوم، کلیدِ هنوز-برقرارِ قفل را میبیند و با CONCURRENT_REQUEST رد میشود.
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: makeMockRedis({ delDelay: 60 }),
  });
  const results = await Promise.allSettled([
    uc.execute({ code: 'SAVE10', userId: 'u1', fare: 100000 }),
    uc.execute({ code: 'SAVE10', userId: 'u1', fare: 100000 }),
  ]);
  const fulfilled = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert(fulfilled.length === 1, `exactly one should succeed, got ${fulfilled.length}`);
  assert(fulfilled[0].value.valid === true, 'winner should be valid');
  assert(rejected.length === 1, 'exactly one should be rejected');
  assert(rejected[0].reason && rejected[0].reason.code === 'CONCURRENT_REQUEST',
    `rejected should be CONCURRENT_REQUEST, got ${rejected[0].reason && rejected[0].reason.code}`);
  passed++;
});
test('SECURITY: fails closed when Redis is unavailable', async () => {
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: null,
  });
  try {
    await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 });
    throw new Error('expected LOCK_UNAVAILABLE');
  } catch (err) {
    assert(err.code === 'LOCK_UNAVAILABLE', `code=${err.code}`);
  }
  passed++;
});

test('SECURITY: Redis acquisition errors do not fall back to unlocked validation', async () => {
  const redis = makeMockRedis();
  redis.set = async () => { throw new Error('Redis connection lost'); };
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: redis,
  });
  try {
    await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 });
    throw new Error('expected LOCK_UNAVAILABLE');
  } catch (err) {
    assert(err.code === 'LOCK_UNAVAILABLE', `code=${err.code}`);
  }
  passed++;
});

test('SECURITY: release never deletes a lock owned by a newer request', async () => {
  const redis = makeMockRedis();
  const originalEval = redis.eval;
  redis.eval = async (script, count, key, token) => {
    // Simulate expiry and reacquisition before the old request releases.
    redis.held.set(key, 'new-owner-token');
    return originalEval(script, count, key, token);
  };
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: redis,
  });
  await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 });
  assert(redis.held.get('lock:promo:SAVE10:user:u1') === 'new-owner-token',
    'the newer owner lock must remain held');
  passed++;
});

test('ERROR: authenticated user is required', async () => {
  const uc = new ValidatePromoUseCase({
    promoCodeModel: makePromoCodeModel(),
    promoUsageModel: { countUserUsages: async () => 0 },
    redisClient: makeMockRedis(),
  });
  try {
    await uc.execute({ code: 'SAVE10', fare: 50000 });
    throw new Error('expected MISSING_USER');
  } catch (err) {
    assert(err.code === 'MISSING_USER', `code=${err.code}`);
  }
  passed++;
});

test('ERROR: missing code', async () => {
  const uc = new ValidatePromoUseCase({ promoCodeModel: makePromoCodeModel(), promoUsageModel: { countUserUsages: async () => 0 }, redisClient: makeMockRedis() });
  try { await uc.execute({ userId: 'u1', fare: 50000 }); throw new Error('expected MISSING_CODE'); }
  catch (err) { assert(err.code === 'MISSING_CODE', `code=${err.code}`); }
  passed++;
});

test('ERROR: code not found', async () => {
  const uc = new ValidatePromoUseCase({ promoCodeModel: { findByCode: async () => null, countUserUsages: async () => 0 }, promoUsageModel: { countUserUsages: async () => 0 }, redisClient: makeMockRedis() });
  try { await uc.execute({ code: 'NOPE', userId: 'u1', fare: 50000 }); throw new Error('expected NOT_FOUND'); }
  catch (err) { assert(err.code === 'NOT_FOUND', `code=${err.code}`); }
  passed++;
});

test('ERROR: expired promo', async () => {
  const uc = new ValidatePromoUseCase({ promoCodeModel: makePromoCodeModel({ expires_at: new Date(Date.now() - 1000).toISOString() }), promoUsageModel: { countUserUsages: async () => 0 }, redisClient: makeMockRedis() });
  try { await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 }); throw new Error('expected EXPIRED'); }
  catch (err) { assert(err.code === 'EXPIRED', `code=${err.code}`); }
  passed++;
});

test('ERROR: inactive promo', async () => {
  const uc = new ValidatePromoUseCase({ promoCodeModel: makePromoCodeModel({ is_active: false }), promoUsageModel: { countUserUsages: async () => 0 }, redisClient: makeMockRedis() });
  try { await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 }); throw new Error('expected INACTIVE'); }
  catch (err) { assert(err.code === 'INACTIVE', `code=${err.code}`); }
  passed++;
});

test('ERROR: per-user limit reached', async () => {
  const uc = new ValidatePromoUseCase({ promoCodeModel: makePromoCodeModel({ max_uses_per_user: 1 }), promoUsageModel: { countUserUsages: async () => 1 }, redisClient: makeMockRedis() });
  try { await uc.execute({ code: 'SAVE10', userId: 'u1', fare: 50000 }); throw new Error('expected USER_LIMIT_REACHED'); }
  catch (err) { assert(err.code === 'USER_LIMIT_REACHED', `code=${err.code}`); }
  passed++;
});
// ---------- اجرای تست‌ها و گزارش ----------
(async () => {
  let failed = 0;
  for (const t of tests) {
    try { await t.fn(); console.log(`  ✓ ${t.name}`); }
    catch (err) { failed++; console.log(`  ✕ ${t.name}\n      ${err.message}`); }
  }
  console.log(`\nTests: ${tests.length} total, ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();