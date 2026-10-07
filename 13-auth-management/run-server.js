const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const AuthRouter = require('./presentation/routes/AuthRouter');
const RegistrationRouter = require('./presentation/routes/RegistrationRouter');
const createProfileRoutes = require('./routes/profile.routes');
const { registerUserRegisteredHandler } = require('../01-core-system/handlers/UserRegisteredHandler');
const { globalRateLimit } = require('./presentation/middleware/rate-limit.middleware');

dotenv.config();

// راه‌اندازی رویداد ثبت‌نام: ایجاد خودکار پروفایل Seller/Advertiser در دیتابیس
// Marketplace (sellers) و Ads (advertisers) هم‌زمان با ثبت در پروسس auth.
registerUserRegisteredHandler();

const app = express();

// CORS: no wildcard. Origins come from ALLOWED_ORIGINS (comma-separated) with a
// safe local-development default. `credentials: true` permits the browser to send
// cookies (needed for the future HttpOnly-cookie session flow).
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow same-origin / non-browser requests (no Origin header) to keep
      // server-to-server and tooling (supertest, curl) working.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);
app.use(express.json());

// Global rate limit: 100 requests / minute / IP (applied to all routes)
app.use(globalRateLimit);

app.use('/api/v1/auth', AuthRouter);

// مسیرهای ثبت‌نام (seller/advertiser) - تکمیل سرویس auth مستقل
app.use('/api/v1/auth', RegistrationRouter);

// Mount profile & settings routes under versioned API path
app.use('/api/v1/profile', createProfileRoutes());

// SECURITY (P0 — حذف شد): اندپوینت `POST /api/v1/auth/translate-token` که توکن‌های
// HS256 را با سکرت پیش‌فرض (`process.env.JWT_SECRET || 'dev-secret'`) و بدون محدودیت
// الگوریتم وریفای می‌کرد و در ازای آن یک توکن RS256 با «نقش دلخواه ورودی» صادر می‌کرد.
// این مسیر امکان جعل هویت و تشدید سطح دسترسی (privilege escalation) را فراهم می‌کرد.
// تنهاترین مسیر معتبر صدور توکن، `/api/v1/auth` (AuthRouter/RegistrationRouter) با
// امضای RS256 و کلید خصوصی محافظت‌شده است.

const port = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(port, process.env.AUTH_HOST || '127.0.0.1', () => {
    console.log(`Auth management API is live on http://localhost:${port}`);
  });
}

module.exports = app;