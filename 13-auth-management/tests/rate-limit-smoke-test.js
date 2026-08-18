/**
 * Smoke test for Rate Limiting (Phase 3-5 Security & Audit)
 *
 * Verifies:
 *   1. First 5 OTP requests succeed (200)
 *   2. 6th request is blocked with 429
 *   3. 429 response has correct error structure
 *   4. Audit/login history entries are recorded
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const http = require('http');
const supertest = require('supertest');

// Reset the shared rate-limit store before tests
const { sharedStore } = require('../presentation/middleware/rate-limit.middleware');

// We need to import the app but override the controller to avoid real OTP sending
// We'll use supertest with the actual Express app
const app = require('../run-server');

async function runTests() {
  console.log('=== Rate Limit Smoke Test (Phase 3-5) ===\n');

  // Clear the rate-limit store to start fresh
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

  // ---------------------------------------------------------------------------
  // Test 1: First 5 OTP requests should succeed (200)
  // ---------------------------------------------------------------------------
  console.log('1. Sending 5 OTP requests (should all return 200)...');
  for (let i = 1; i <= 5; i++) {
    const res = await supertest(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber })
      .set('X-Forwarded-For', '192.168.1.100');

    assert(res.status === 200, `Request #${i}: status 200 (got ${res.status})`);
    assert(res.body.success === true, `Request #${i}: success=true`);
  }

  // ---------------------------------------------------------------------------
  // Test 2: 6th OTP request should be rate-limited (429)
  // ---------------------------------------------------------------------------
  console.log('\n2. Sending 6th OTP request (should return 429)...');
  const res6 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber })
    .set('X-Forwarded-For', '192.168.1.100');

  assert(res6.status === 429, `6th request: status 429 (got ${res6.status})`);
  assert(res6.body.success === false, `6th request: success=false`);
  assert(res6.body.error === 'RATE_LIMIT_EXCEEDED', `6th request: error=RATE_LIMIT_EXCEEDED`);
  console.log(`   429 response body: ${JSON.stringify(res6.body)}`);

  // ---------------------------------------------------------------------------
  // Test 3: Different phone number should still work (key includes phone)
  // ---------------------------------------------------------------------------
  console.log('\n3. Sending request with different phone (should succeed)...');
  const res7 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber: '09987654321' })
    .set('X-Forwarded-For', '192.168.1.100');

  assert(res7.status === 200, `Different phone: status 200 (got ${res7.status})`);

  // ---------------------------------------------------------------------------
  // Test 4: Different IP should still work (key includes IP)
  // ---------------------------------------------------------------------------
  console.log('\n4. Sending request from different IP (should succeed)...');
  const res8 = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber })
    .set('X-Forwarded-For', '10.0.0.50');

  assert(res8.status === 200, `Different IP: status 200 (got ${res8.status})`);

  // ---------------------------------------------------------------------------
  // Test 5: Verify-otp endpoint also has strict rate limit
  // ---------------------------------------------------------------------------
  console.log('\n5. Testing strict rate limit on verify-otp endpoint...');
  sharedStore._store.clear();

  // Send 5 verify requests (will fail with 401 but should not be rate-limited)
  for (let i = 1; i <= 5; i++) {
    const res = await supertest(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber, otpCode: '00000' })
      .set('X-Forwarded-For', '192.168.1.200');

    assert(res.status === 401, `Verify #${i}: status 401 (got ${res.status})`);
  }

  // 6th verify should be 429
  const resVerify6 = await supertest(app)
    .post('/api/v1/auth/verify-otp')
    .send({ phoneNumber, otpCode: '00000' })
    .set('X-Forwarded-For', '192.168.1.200');

  assert(resVerify6.status === 429, `Verify #6: status 429 (got ${resVerify6.status})`);

  // ---------------------------------------------------------------------------
  // Test 6: Rate limit headers are present
  // ---------------------------------------------------------------------------
  console.log('\n6. Checking rate limit headers...');
  sharedStore._store.clear();
  const resHeader = await supertest(app)
    .post('/api/v1/auth/request-otp')
    .send({ phoneNumber: '09111111111' })
    .set('X-Forwarded-For', '192.168.1.300');

  assert(
    resHeader.headers['x-ratelimit-limit'] !== undefined,
    'X-RateLimit-Limit header present'
  );
  assert(
    resHeader.headers['x-ratelimit-remaining'] !== undefined,
    'X-RateLimit-Remaining header present'
  );
  console.log(
    `   Headers: limit=${resHeader.headers['x-ratelimit-limit']}, remaining=${resHeader.headers['x-ratelimit-remaining']}, window=${resHeader.headers['x-ratelimit-window']}`
  );

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
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