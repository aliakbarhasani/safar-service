const express = require('express');
const cors = require('cors');
const adsRoutes = require('./routes/ads.route');

const app = express();
const port = Number(process.env.ADS_PORT || 3003);

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/v1/ads', adsRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'ads' });
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
    console.log(`[AdsService] Live on http://localhost:${port}`);
  });
}

module.exports = app;
