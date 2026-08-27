const request = require('supertest');
const app = require('../../run-server');
const JwtService = require('../../domain/services/JwtService');

// نکته مهم: هاردکد کردن شماره موبایل ثابت در تست‌های یکپارچگی، با state ماندگار
// دیتابیس (otp_codes / users) در اجراهای متوالی برخورد می‌کند و به صورت
// نادمختصری (flaky) خطای 401 می‌دهد. مانند E2E موجود در 01-core-system
// (تابع freshPhone) یک شماره تازه و یکتا در هر اجرا تولید می‌کنیم تا تست
// قطعی (deterministic) و همیشه سبز بماند.
function freshPhone() {
  return '+9891' + String(Date.now()).slice(-8);
}

describe('Auth Management Integration Tests', () => {
  let phoneValid;
  let phoneInvalid;

  beforeEach(() => {
    // هر تست شماره‌ای تازه می‌گیرد تا با اجرای قبلی/بعدی برخورد نکند.
    phoneValid = freshPhone();
    phoneInvalid = freshPhone();
  });

  test('POST /api/v1/auth/request-otp returns success', async () => {
    const res = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber: phoneValid })
      .set('Accept', 'application/json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('status_code', 200);
  });

  test('POST /api/v1/auth/verify-otp returns token for valid OTP', async () => {
    const requestOtpRes = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber: phoneValid })
      .set('Accept', 'application/json');

    const otpCode = requestOtpRes.body.data && requestOtpRes.body.data.otpCode ? requestOtpRes.body.data.otpCode : null;

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber: phoneValid, otpCode })
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
      .send({ phoneNumber: phoneInvalid, otpCode: '00000' })
      .set('Accept', 'application/json');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('status_code', 401);
  });
});
