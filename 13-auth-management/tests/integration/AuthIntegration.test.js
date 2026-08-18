const request = require('supertest');
const app = require('../../run-server');
const JwtService = require('../../domain/services/JwtService');

describe('Auth Management Integration Tests', () => {
  test('POST /api/v1/auth/request-otp returns success', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber: '+989123456789' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('status_code', 200);
  });

  test('POST /api/v1/auth/verify-otp returns token for valid OTP', async () => {
    const requestOtpRes = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber: '+989123456780' })
      .set('Accept', 'application/json');

    const otpCode = requestOtpRes.body.data && requestOtpRes.body.data.otpCode ? requestOtpRes.body.data.otpCode : null;

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber: '+989123456780', otpCode })
      .set('Accept', 'application/json');

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toHaveProperty('success', true);
    expect(verifyRes.body).toHaveProperty('data');
    expect(verifyRes.body.data).toHaveProperty('token');

    // اطمینان از یکسان بودن الگوریتم توکن (RS256) با middleware پروفایل و بقیه‌ی سرویس‌ها
    const decoded = new JwtService().verifyAccessToken(verifyRes.body.data.token);
    expect(decoded).toHaveProperty('userId');
    expect(decoded).toHaveProperty('type', 'access');
    expect(decoded).toHaveProperty('role', 'passenger');
  });

  test('POST /api/v1/auth/verify-otp returns 401 for invalid OTP', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber: '+989123456781', otpCode: '00000' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('status_code', 401);
  });
});
