const express = require('express');
const ProfileController = require('../controllers/profile.controller');
const AuthMiddleware = require('../middleware/auth.middleware');

/**
 * Profile routes factory.
 * All routes require JWT authentication.
 */
function createProfileRoutes() {
  const router = express.Router();
  const authMiddleware = new AuthMiddleware();
  const profileController = new ProfileController();

  // All profile routes require authentication
  router.use(authMiddleware.middleware());

  // GET /api/profile - Get profile + settings
  router.get('/', (req, res) => profileController.getProfile(req, res));

  // PATCH /api/profile/profile - Update profile
  router.patch('/profile', (req, res) => profileController.updateProfile(req, res));

  // PATCH /api/profile/settings - Update settings
  router.patch('/settings', (req, res) => profileController.updateSettings(req, res));

  return router;
}

module.exports = createProfileRoutes;