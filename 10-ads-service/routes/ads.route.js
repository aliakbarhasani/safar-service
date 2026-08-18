const express = require('express');
const campaignRoutes = require('./campaign.route');

const router = express.Router();

// Mount campaign routes
router.use('/campaigns', campaignRoutes);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Ads service is healthy' });
});

module.exports = router;
