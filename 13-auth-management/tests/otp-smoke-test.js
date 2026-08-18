/**
 * Smoke test for OTP flow (RequestOTP + VerifyOTP)
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const RequestOtpUseCase = require('../application/use-cases/RequestOtpUseCase');
const VerifyOtpUseCase = require('../application/use-cases/VerifyOtpUseCase');
const OtpRepository = require('../infrastructure/repositories/OtpRepository');
const ConsoleSmsProvider = require('../domain/strategies/ConsoleSmsProvider');

// Custom strategy to capture OTP codes for testing
class TestSmsProvider extends ConsoleSmsProvider {
  constructor() {
    super();
    this.lastOtpCode = null;
    this.lastRecipient = null;
  }

  async send(recipient, message) {
    this.lastRecipient = recipient;
    const match = message.match(/OTP code is: (\d{5})/);
    this.lastOtpCode = match ? match[1] : null;
    return super.send(recipient, message);
  }
}

async function runTests() {
  const phoneNumber = '09123456789';

  // Use shared repository
  const sharedRepo = new OtpRepository();
  const testProvider = new TestSmsProvider();

  const requestUseCase = new RequestOtpUseCase({
    otpRepository: sharedRepo,
    smsProvider: testProvider,
  });

  const verifyUseCase = new VerifyOtpUseCase({
    otpRepository: sharedRepo,
  });

  console.log('=== OTP Flow Smoke Test ===\n');

  // 1. Request OTP
  console.log('1. Requesting OTP...');
  const requestResult = await requestUseCase.execute(phoneNumber, 'login');
  console.log('   Request result:', JSON.stringify({ success: requestResult.success, message: requestResult.message, phoneNumber: requestResult.phoneNumber, ttl: requestResult.ttl }, null, 2));
  console.log('   Captured OTP:', testProvider.lastOtpCode);

  if (!requestResult.success) {
    console.error('   [FAIL] Request OTP failed');
    process.exit(1);
  }
  console.log('   [PASS] OTP requested successfully\n');

  // 2. Request again should succeed
  console.log('2. Requesting second OTP (should replace previous)...');
  const requestResult2 = await requestUseCase.execute(phoneNumber, 'login');
  if (!requestResult2.success) {
    console.error('   [FAIL] Second OTP request failed');
    process.exit(1);
  }
  console.log('   [PASS] Second OTP requested\n');

  // 3. Request a fresh OTP for verification tests
  console.log('3. Requesting fresh OTP for verification...');
  const requestResult3 = await requestUseCase.execute(phoneNumber, 'login');
  if (!requestResult3.success) {
    console.error('   [FAIL] Fresh OTP request failed');
    process.exit(1);
  }
  const currentOtp = testProvider.lastOtpCode;
  console.log('   Fresh OTP captured:', currentOtp);

  // 4. Try to verify with invalid code
  console.log('4. Attempting verify with invalid OTP...');
  try {
    await verifyUseCase.execute(phoneNumber, 'xxxxx', 'login');
    console.error('   [FAIL] Should reject invalid OTP');
    process.exit(1);
  } catch (err) {
    if (err.message === 'Invalid OTP') {
      console.log('   [PASS] Correctly rejected invalid OTP\n');
    } else {
      console.error('   [FAIL] Unexpected error:', err.message);
      process.exit(1);
    }
  }

  // 5. Verify with correct code
  console.log('5. Verifying with correct OTP...');
  const verifyResult = await verifyUseCase.execute(phoneNumber, currentOtp, 'login');
  if (!verifyResult.success || !verifyResult.token) {
    console.error('   [FAIL] Verify OTP failed:', verifyResult.message);
    process.exit(1);
  }
  console.log('   [PASS] OTP verified successfully, token issued\n');

  // 6. Try to replay the same OTP (should fail - replay protection)
  console.log('6. Attempting replay attack with same OTP...');
  try {
    await verifyUseCase.execute(phoneNumber, currentOtp, 'login');
    console.error('   [FAIL] Should reject reused OTP (replay protection)');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('already been used')) {
      console.log('   [PASS] Replay attack blocked correctly\n');
    } else {
      console.error('   [FAIL] Unexpected error:', err.message);
      process.exit(1);
    }
  }

  // 7. Test max attempts exceeded
  console.log('7. Testing max attempts exceeded...');
  const requestResult4 = await requestUseCase.execute(phoneNumber, 'login');
  if (!requestResult4.success) {
    console.error('   [FAIL] Fresh OTP request for max-attempts test failed');
    process.exit(1);
  }

  for (let i = 0; i < 5; i++) {
    try {
      await verifyUseCase.execute(phoneNumber, '00000', 'login');
    } catch (err) {
      // expected
    }
  }
  try {
    await verifyUseCase.execute(phoneNumber, '00000', 'login');
    console.error('   [FAIL] Should block after max attempts');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('Maximum OTP attempts')) {
      console.log('   [PASS] Max attempts enforced\n');
    } else {
      console.error('   [FAIL] Wrong error:', err.message);
      process.exit(1);
    }
  }

  console.log('=== All smoke tests passed ===');
  process.exit(0);
}

runTests().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});