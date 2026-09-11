const express = require('express');
const cors = require('cors');
const marketplaceRoutes = require('./routes/marketplace.route');

const app = express();
const port = Number(process.env.MARKETPLACE_PORT || 3012);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1/marketplace', marketplaceRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'marketplace' });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    status_code: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[MarketplaceService] Live on http://localhost:${port}`);
  });
}

module.exports = app;
