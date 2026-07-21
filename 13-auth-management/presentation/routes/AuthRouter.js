const express = require('express');
const AuthController = require('../controllers/AuthController');

const router = express.Router();
const authController = new AuthController();

router.post('/request-otp', (req, res) => authController.requestOtp(req, res));
router.post('/verify-otp', (req, res) => authController.verifyOtp(req, res));

module.exports = router;
