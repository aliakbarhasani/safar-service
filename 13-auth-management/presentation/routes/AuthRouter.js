const express = require('express');
const AuthController = require('../controllers/AuthController');
const { phoneRateLimit } = require('../middleware/rate-limit.middleware');

const router = express.Router();
const authController = new AuthController();

// OTP request and verification are limited by phone number so changing IP
// addresses cannot bypass the authentication protection.
router.post('/request-otp', phoneRateLimit(), (req, res) => authController.requestOtp(req, res));
router.post('/verify-otp', phoneRateLimit(), (req, res) => authController.verifyOtp(req, res));
router.post('/logout', (req, res) => authController.logout(req, res));

module.exports = router;
