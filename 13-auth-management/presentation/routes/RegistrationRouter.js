const express = require('express');
const router = express.Router();
const RegistrationController = require('../controllers/RegistrationController');

const registrationController = new RegistrationController();

/**
 * POST /register
 * Register a new user
 *
 * Body:
 *   - phoneNumber (required)
 *   - firstName (required)
 *   - lastName (required)
 *   - password (required)
 *   - email (optional)
 *   - role (optional, default: passenger)
 *   - countryId (optional)
 *   - preferredCurrencyId (optional)
 *
 * Supported roles: passenger, driver, provider, seller, advertiser, admin, super_admin
 */
router.post('/register', (req, res) => registrationController.register(req, res));
router.post('/register/seller', (req, res) => registrationController.registerSeller(req, res));
router.post('/register/advertiser', (req, res) => registrationController.registerAdvertiser(req, res));

module.exports = router;