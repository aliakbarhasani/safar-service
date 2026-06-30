const express = require('express');
const router = express.Router();
const { index } = require('../controllers/home.controller');
const tripRoutes = require('./trip.route');
const userRoutes = require('./user.route');

router.get('/', index);
router.use('/api/trips', tripRoutes);
router.use('/api/users', userRoutes);

module.exports = router;
