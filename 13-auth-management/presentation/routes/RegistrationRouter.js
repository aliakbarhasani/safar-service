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
 * SECURITY: ثبت‌نام عمومی نقش را از Body نمی‌پذیرد و همیشه با نقش پیش‌فرض passenger ساخته می‌شود.
 * Supported self-registration roles: passenger, driver, provider, seller, advertiser
 * (admin/super_admin هرگز از مسیر ثبت‌نام عمومی قابل اعطا نیستند.)
 */
router.post('/register', (req, res) => registrationController.register(req, res));
router.post('/register/seller', (req, res) => registrationController.registerSeller(req, res));
router.post('/register/advertiser', (req, res) => registrationController.registerAdvertiser(req, res));

module.exports = router;