/**
 * Smoke test for JWT + Session Management
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const JwtService = require('../domain/services/JwtService');
const SessionManager = require('../domain/services/SessionManager');
const UserRepository = require('../infrastructure/repositories/UserRepository');

async function runTests() {
  console.log('=== JWT & Session Management Smoke Test ===\n');

  const jwtService = new JwtService();
  const sessionManager = new SessionManager();
  const userRepo = new UserRepository();

  // Ensure a test user exists
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

  // 1. Create session (issue tokens)
  console.log('\n1. Creating session...');
  const session = await sessionManager.createSession(user, { ip: '127.0.0.1', userAgent: 'test' });
  console.log('   Access token:', session.accessToken.substring(0, 30) + '...');
  console.log('   Refresh token:', session.refreshToken.substring(0, 30) + '...');
  console.log('   Session ID:', session.sessionId);

  // Verify access token
  const accessPayload = jwtService.verifyAccessToken(session.accessToken);
  console.log('   Access token payload:', accessPayload);
  if (!accessPayload || accessPayload.userId !== user.id) {
    console.error('   [FAIL] Access token verification failed');
    process.exit(1);
  }
  console.log('   [PASS] Session created and access token verified\n');

  // 2. Refresh token rotation
  console.log('2. Testing refresh token rotation...');
  const refreshed = await sessionManager.refreshSession(session.refreshToken);
  console.log('   New access token:', refreshed.accessToken.substring(0, 30) + '...');
  console.log('   New refresh token:', refreshed.refreshToken.substring(0, 30) + '...');

  // Old refresh token should fail now
  try {
    await sessionManager.refreshSession(session.refreshToken);
    console.error('   [FAIL] Old refresh token should be invalid after rotation');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('Invalid refresh token')) {
      console.log('   [PASS] Old refresh token correctly invalidated\n');
    } else {
      console.error('   [FAIL] Unexpected error:', err.message);
      process.exit(1);
    }
  }

  // 3. Revoke session
  console.log('3. Testing session revocation...');
  await sessionManager.revokeSession(session.sessionId);

  // After revoke, refresh should fail (either revoked or invalid token)
  try {
    await sessionManager.refreshSession(refreshed.refreshToken);
    console.error('   [FAIL] Revoked session should not refresh');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('revoked') || err.message.includes('Invalid refresh token')) {
      console.log('   [PASS] Revoked session correctly rejected\n');
    } else {
      console.error('   [FAIL] Unexpected error:', err.message);
      process.exit(1);
    }
  }

  console.log('=== All JWT/Session smoke tests passed ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});