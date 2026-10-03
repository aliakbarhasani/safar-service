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
const { Pool } = require('pg');

dotenv.config();

const config = require('../14-config-system/server.config');
const PricingRepository = require('./infrastructure/PricingRepository');
const GenerateQuoteUseCase = require('./application/GenerateQuoteUseCase');
const GetQuoteUseCase = require('./application/GetQuoteUseCase');
const ConsumeQuoteUseCase = require('./application/ConsumeQuoteUseCase');
const PricingController = require('./presentation/PricingController');
const createPricingRouter = require('./presentation/PricingRouter');

const app = express();

// ── Security & Parsing Middleware ─────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ── Dependency Wiring (Composition Root) ──────────────────────────
// The service owns its own PostgreSQL pool. `pg.Pool` connects lazily, so
// loading this module never requires a live database (important for tests and
// for booting the container before the DB is ready).
const pricingPool = new Pool({ ...config.pg });

const pricingRepository = new PricingRepository(pricingPool);
const pricingController = new PricingController({
  generateQuoteUseCase: new GenerateQuoteUseCase(pricingRepository),
  getQuoteUseCase: new GetQuoteUseCase(pricingRepository),
  consumeQuoteUseCase: new ConsumeQuoteUseCase(pricingRepository),
});
const pricingRouter = createPricingRouter(pricingController);

// ── Health ────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({ success: true, module: 'pricing-engine', status: 'ok' });
});

// ── Routes ────────────────────────────────────────────────────────
// Single canonical route contract. The API Gateway uses the same prefix
// when composing the pricing module into the unified API.
app.use('/api/v1/pricing', pricingRouter);

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
