/**
 * Smoke test for Rate Limiting (Phase 3-5 Security & Audit)
 *
 * Verifies:
 *   1. First 5 OTP requests succeed (200)
 *   2. 6th request is blocked with 429
 *   3. 429 response has correct error structure
 *   4. A different phone number has an independent limit
 *   5. Changing X-Forwarded-For cannot bypass the phone-based OTP limit
 *   6. Verify-otp is also protected by phone-based rate limiting
 *   7. Rate-limit headers are present
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const supertest = require('supertest');
const { sharedStore } = require('../presentation/middleware/rate-limit.middleware');
const app = require('../run-server');

async function runTests() {
  console.log('=== Rate Limit Smoke Test (Phase 3-5) ===\n');

  sharedStore._store.clear();

  const phoneNumber = '09123456789';
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`   [PASS] ${message}`);
      passed++;
    } else {
      console.error(`   [FAIL] ${message}`);
      failed++;
    }
  }

  console.log('1. Sending 5 OTP requests (should all return 200)...');
  for (let i = 1; i <= 5; i++) {
    const res = await supertest(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber })
      .set('X-Forwarded-For', '192.168.1.100');

    assert(res.status === 200, `Request #${i}: status 200 (got ${res.status})`);
    assert(res.body.success === true, `Request #${i}: success=true`);
  }

  console.log('\n2. Sending 6th OTP request (should return 429)...');
  const res6 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber })
    .set('X-Forwarded-For', '192.168.1.100');

  assert(res6.status === 429, `6th request: status 429 (got ${res6.status})`);
  assert(res6.body.success === false, '6th request: success=false');
  assert(res6.body.error === 'RATE_LIMIT_EXCEEDED', '6th request: error=RATE_LIMIT_EXCEEDED');

  console.log('\n3. Different phone number should have an independent limit...');
  const res7 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber: '09987654321' })
    .set('X-Forwarded-For', '192.168.1.100');

  assert(res7.status === 200, `Different phone: status 200 (got ${res7.status})`);

  console.log('\n4. Changing IP must not bypass the phone-based OTP limit...');
  const res8 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber })
    .set('X-Forwarded-For', '10.0.0.50');

  assert(res8.status === 429, `Different IP: status 429 (got ${res8.status})`);

  console.log('\n5. Verify-otp endpoint also has phone-based rate limiting...');
  sharedStore._store.clear();

  for (let i = 1; i <= 5; i++) {
    const res = await supertest(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber, otpCode: '00000' })
      .set('X-Forwarded-For', '192.168.1.200');

    assert(res.status === 401, `Verify #${i}: status 401 (got ${res.status})`);
  }

  const resVerify6 = await supertest(app)
    .post('/api/v1/auth/verify-otp')
    .send({ phoneNumber, otpCode: '00000' })
    .set('X-Forwarded-For', '10.10.10.10');

  assert(resVerify6.status === 429, `Verify #6 from different IP: status 429 (got ${resVerify6.status})`);

  console.log('\n6. Checking rate limit headers...');
  sharedStore._store.clear();
  const resHeader = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber: '09111111111' })
    .set('X-Forwarded-For', '192.168.1.300');

  assert(resHeader.headers['x-ratelimit-limit'] !== undefined, 'X-RateLimit-Limit header present');
  assert(resHeader.headers['x-ratelimit-remaining'] !== undefined, 'X-RateLimit-Remaining header present');
  assert(resHeader.headers['retry-after'] === undefined, 'Retry-After absent before limit is exceeded');

  console.log('\n==============================================');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('==============================================');

  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n=== All rate limit smoke tests passed ===');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});
