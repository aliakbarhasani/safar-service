/**
 * run-server.js - Entry point for the Pricing Engine microservice
 *
 * Bootstraps an Express server with security middleware and routes.
 * Fully decoupled — communicates with other modules via HTTP only.
 *
 * Architecture: Clean Architecture - Entry Point
 * Status: LOCKED | Created v2
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const dotenv = require('dotenv');
const PricingRouter = require('./_legacy_archive/presentation/routes/PricingRouter');

dotenv.config();

const app = express();

// ── Security & Parsing Middleware ─────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Routes ────────────────────────────────────────────────────────
app.use('/', PricingRouter);
app.use('/api/v1/pricing', PricingRouter);

// ── 404 Handler ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    status_code: 404,
    code: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';
  console.error('[PricingEngine] Error', statusCode + ':', message);
  res.status(statusCode).json({
    success: false,
    status_code: statusCode,
    code: err.code || 'INTERNAL_ERROR',
    message,
  });
});

// ── Start Server ──────────────────────────────────────────────────
const port = process.env.PORT || 3005;

if (require.main === module) {
  app.listen(port, () => {
    console.log(`[PricingEngine] Live on http://localhost:${port}`);
  });
}

module.exports = app;