/**
 * Smoke test for Profile & Settings Management
 * Tests: GetProfile, UpdateProfile, UpdateSettings with JWT protection
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const express = require('express');
const http = require('http');
const JwtService = require('../domain/services/JwtService');
const SessionManager = require('../domain/services/SessionManager');
const UserRepository = require('../infrastructure/repositories/UserRepository');
const createProfileRoutes = require('../routes/profile.routes');

async function runTests() {
  console.log('=== Profile & Settings Management Smoke Test ===\n');

  const jwtService = new JwtService();
  const sessionManager = new SessionManager();
  const userRepo = new UserRepository();

  let user = await userRepo.findByPhoneNumber('09123456789');
  if (!user) {
    const passwordHash = await bcrypt.hash('test-password-123', 10);
    user = await userRepo.create({
      phoneNumber: '09123456789',
      firstName: 'Test',
      lastName: 'User',
      passwordHash,
      role: 'passenger',
      status: 'active',
      isPhoneVerified: true,
    });
  }
  console.log('Test user:', user.id, user.phone_number, user.role);

  const session = await sessionManager.createSession(user, { ip: '127.0.0.1', userAgent: 'test' });
  const accessToken = session.accessToken;
  console.log('Access token obtained for protected routes\n');

  const app = express();
  app.use(express.json());
  app.use('/api/profile', createProfileRoutes());

  const server = http.createServer(app);
  const PORT = 3999;

  await new Promise((resolve) => server.listen(PORT, resolve));
  console.log('Test server running on http://localhost:' + PORT + '\n');

  const baseUrl = 'http://localhost:' + PORT;
  let passed = 0;
  let failed = 0;

  async function request(method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    const opts = { method: method, headers: headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(baseUrl + urlPath, opts);
    return { status: res.status, data: await res.json() };
  }

  // 1. GET profile (initial)
  console.log('1. Getting profile (initial)...');
  let resp = await request('GET', '/api/profile');
  console.log('   Status:', resp.status);
  console.log('   Profile:', JSON.stringify(resp.data.data.profile));
  console.log('   Settings:', JSON.stringify(resp.data.data.settings));
  if (resp.status === 200 && resp.data.success) {
    console.log('   [PASS] Profile retrieved\n');
    passed++;
  } else {
    console.error('   [FAIL] Expected 200 success');
    failed++;
  }

  // 2. Update profile
  console.log('2. Updating profile...');
  resp = await request('PATCH', '/api/profile/profile', {
    firstName: 'Updated',
    lastName: 'Name',
    email: 'updated@test.com',
  });
  console.log('   Status:', resp.status);
  console.log('   Result:', JSON.stringify(resp.data.data));
  if (resp.status === 200 && resp.data.success && resp.data.data.email === 'updated@test.com') {
    console.log('   [PASS] Profile updated\n');
    passed++;
  } else {
    console.error('   [FAIL] Profile update failed');
    failed++;
  }

  // 3. Update settings (language to 'en', currency to 'USD')
  console.log('3. Updating settings (language=en, currency=USD)...');
  resp = await request('PATCH', '/api/profile/settings', {
    language: 'en',
    currency: 'USD',
    country: 'US',
  });
  console.log('   Status:', resp.status);
  console.log('   Result:', JSON.stringify(resp.data.data));
  if (resp.status === 200 && resp.data.success && resp.data.data.language === 'en' && resp.data.data.currency === 'USD') {
    console.log('   [PASS] Settings updated\n');
    passed++;
  } else {
    console.error('   [FAIL] Settings update failed');
    failed++;
  }

  // 4. GET profile again (after updates)
  console.log('4. Getting profile (after updates)...');
  resp = await request('GET', '/api/profile');
  console.log('   Status:', resp.status);
  console.log('   Profile:', JSON.stringify(resp.data.data.profile));
  console.log('   Settings:', JSON.stringify(resp.data.data.settings));
  if (resp.status === 200 && resp.data.data.profile.email === 'updated@test.com' && resp.data.data.settings.language === 'en') {
    console.log('   [PASS] Profile and settings consistent\n');
    passed++;
  } else {
    console.error('   [FAIL] Profile/settings data inconsistent');
    failed++;
  }

  // 5. Test without JWT (should fail)
  console.log('5. Testing without JWT (should fail)...');
  const noAuthRes = await fetch(baseUrl + '/api/profile', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  console.log('   Status:', noAuthRes.status);
  if (noAuthRes.status === 401) {
    console.log('   [PASS] Unauthenticated request rejected\n');
    passed++;
  } else {
    console.error('   [FAIL] Expected 401, got ' + noAuthRes.status);
    failed++;
  }

  console.log('=== Results: ' + passed + ' passed, ' + failed + ' failed ===');
  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(function (err) {
  console.error('[FATAL]', err);
  process.exit(1);
});