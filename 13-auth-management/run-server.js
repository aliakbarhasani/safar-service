const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const AuthRouter = require('./presentation/routes/AuthRouter');
const RegistrationRouter = require('./presentation/routes/RegistrationRouter');
const createProfileRoutes = require('./routes/profile.routes');
const jwt = require('jsonwebtoken');
const JwtService = require('./domain/services/JwtService');
const { registerUserRegisteredHandler } = require('../01-core-system/handlers/UserRegisteredHandler');
const { globalRateLimit } = require('./presentation/middleware/rate-limit.middleware');

dotenv.config();

// راه‌اندازی رویداد ثبت‌نام: ایجاد خودکار پروفایل Seller/Advertiser در دیتابیس
// Marketplace (sellers) و Ads (advertisers) هم‌زمان با ثبت در پروسس auth.
registerUserRegisteredHandler();

const app = express();
app.use(cors());
app.use(express.json());

// Global rate limit: 100 requests / minute / IP (applied to all routes)
app.use(globalRateLimit);

app.use('/api/v1/auth', AuthRouter);

// مسیرهای ثبت‌نام (seller/advertiser) - تکمیل سرویس auth مستقل
app.use('/api/v1/auth', RegistrationRouter);

// Mount profile & settings routes under versioned API path
app.use('/api/v1/profile', createProfileRoutes());

// Temporary helper: translate HS256 tokens (issued by verify-otp) to RS256 tokens
// This allows internal E2E tests where verify-otp returns an HS256 token while
// the application expects RS256 (JwtService) for protected routes.
app.post('/api/v1/auth/translate-token', express.json(), (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token is required' });

  try {
    const secret = process.env.JWT_SECRET || 'dev-secret';
    const decoded = jwt.verify(token, secret);
    const jwtService = new JwtService();
    const rsToken = jwtService.generateAccessToken({
      id: decoded.userId || decoded.user_id || decoded.user?.id,
      phoneNumber: decoded.phoneNumber || decoded.phone_number || decoded.phone,
      role: decoded.role,
    });

    return res.status(200).json({ success: true, token: rsToken });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

const port = process.env.PORT || 3001;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Auth management API is live on http://localhost:${port}`);
  });
}

module.exports = app;