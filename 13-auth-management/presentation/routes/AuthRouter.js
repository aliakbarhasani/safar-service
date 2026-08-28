const express = require('express');
const AuthController = require('../controllers/AuthController');
const { strictRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();
const authController = new AuthController();

// Strict rate limit (5 req/3min) on OTP request and verify endpoints
router.post('/request-otp', strictRateLimit(), (req, res) => authController.requestOtp(req, res));
router.post('/verify-otp', strictRateLimit(), (req, res) => authController.verifyOtp(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

module.exports = router;