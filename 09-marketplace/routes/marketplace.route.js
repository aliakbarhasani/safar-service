const express = require('express');
const productRoutes = require('./product.route');

const router = express.Router();

// Mount product routes
router.use('/products', productRoutes);

// Health check
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'Marketplace service is healthy' });
});

module.exports = router;
