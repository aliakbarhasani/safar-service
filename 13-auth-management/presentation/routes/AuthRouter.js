const express = require('express');
const AuthController = require('../controllers/AuthController');
const EmailAuthController = require('../controllers/EmailAuthController');
const { phoneRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();
const authController = new AuthController();
const emailAuthController = new EmailAuthController();

// OTP request and verification are limited by phone number so changing IP
// addresses cannot bypass the authentication protection.
router.post('/request-otp', phoneRateLimit(), (req, res) => authController.requestOtp(req, res));
router.post('/verify-otp', phoneRateLimit(), (req, res) => authController.verifyOtp(req, res));
// Limit password attempts by normalized email and client IP; shared Redis storage is a future multi-instance hardening step.
const { strictRateLimit } = require('../middleware/rate-limit.middleware');
router.post('/login-email', strictRateLimit({
  maxRequests: 5,
  windowMs: 3 * 60 * 1000,
  keyFn: (req) => `email-login:${String(req.body?.email || '').trim().toLowerCase()}:${req.socket?.remoteAddress || 'unknown'}`,
}), (req, res) => emailAuthController.login(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

module.exports = router;
