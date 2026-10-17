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
    // Request the OTP in international format, then verify it using the
    // equivalent national format. This checks normalization across the real
    // HTTP/controller/use-case/repository path rather than only in unit tests.
    const phoneInternational = phoneValid;
    const phoneNational = phoneInternational.replace(/^\+98/, '0');

    const requestOtpRes = await request(app)
      .post('/api/v1/auth/request-otp')
      .send({ phoneNumber: phoneInternational })
      .set('Accept', 'application/json');

    expect(requestOtpRes.status).toBe(200);
    expect(requestOtpRes.body.data.phoneNumber).toBe(phoneNational);

    const otpCode = requestOtpRes.body.data && requestOtpRes.body.data.otpCode ? requestOtpRes.body.data.otpCode : null;

    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ phoneNumber: phoneNational, otpCode })
      .set('Accept', 'application/json');

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toHaveProperty('success', true);
    expect(verifyRes.body).toHaveProperty('data');
    expect(verifyRes.body.data).toHaveProperty('user');
    // Access tokens must not be exposed to JavaScript in the JSON response.
    expect(verifyRes.body.data).not.toHaveProperty('token');

    const cookies = verifyRes.headers['set-cookie'] || [];
    const accessCookie = cookies.find((cookie) => cookie.startsWith('access_token='));
    expect(accessCookie).toBeDefined();
    const tokenPair = accessCookie.split(';', 1)[0];
    const accessToken = decodeURIComponent(tokenPair.slice('access_token='.length));
    expect(accessToken).toBeTruthy();

    // اطمینان از یکسان بودن الگوریتم توکن (RS256) با middleware پروفایل و بقیه‌ی سرویس‌ها
    const decoded = new JwtService().verifyAccessToken(accessToken);
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
