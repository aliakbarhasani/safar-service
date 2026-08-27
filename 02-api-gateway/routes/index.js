const express = require('express');
const router = express.Router();
const { index } = require('../../03-user-service/controllers/home.controller');
const userRoutes = require('../../03-user-service/routes/user.route');

router.get('/', index);
// 06-trip-service archived: trips are served by 16-mobility-engine via api.routes.js (/api/v1/trips)
router.use('/api/users', userRoutes);

module.exports = router;