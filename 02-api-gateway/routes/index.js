const express = require('express');
const router = express.Router();
const { index } = require('../../03-user-service/controllers/home.controller');
const tripRoutes = require('../../06-trip-service/routes/trip.route');
const userRoutes = require('../../03-user-service/routes/user.route');

router.get('/', index);
router.use('/api/trips', tripRoutes);
router.use('/api/users', userRoutes);

module.exports = router;