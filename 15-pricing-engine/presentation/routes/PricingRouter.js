/**
 * PricingRouter - Express Router for Pricing Engine API
 *
 * Defines all REST API endpoints for the pricing engine.
 * Delegates all business logic to the PricingController.
 *
 * Architecture: Clean Architecture - Presentation Layer
 * Status: LOCKED | Created v2
 */

const express = require('express');
const PricingController = require('../controllers/PricingController');
const { GeneratePriceQuote, RecalculatePrice, ResolvePricingRule } = require('../../application/useCases');
const { PostgresPricingRuleResolver, MockCacheProvider, MockEventPublisher } = require('../../infrastructure');

const router = express.Router();

// ── Wire up dependencies ──────────────────────────────────────────
// استخدام RuleResolver داینامیک که ضرایب را از جدول pricing_configs در
// PostgreSQL می‌خواند (نه از کد - هیچ عددی در کد Hardcode نشده است).
const ruleResolver = new PostgresPricingRuleResolver();
const cacheProvider = new MockCacheProvider();
const eventPublisher = new MockEventPublisher();
const config = {
  quoteTTLMinutes: 5,
  engineVersion: '1.0.0',
  multiplierVersion: 1,
  algorithmVersion: '1.0.0',
  configVersion: '1.0.0',
};

const generateQuote = new GeneratePriceQuote({ ruleResolver, eventPublisher, cacheProvider, config });
const recalculatePrice = new RecalculatePrice({ ruleResolver, eventPublisher, cacheProvider, config });
const resolveRule = new ResolvePricingRule({ ruleResolver, cacheProvider });

const controller = new PricingController({ generateQuote, recalculatePrice, resolveRule });

// ── Health Check ──────────────────────────────────────────────────
router.get('/health', (req, res) => {
  return res.status(200).json({
    success: true,
    status_code: 200,
    module: 'pricing-engine',
    version: '1.0.0',
    message: 'Pricing Engine API is operational',
    timestamp: new Date().toISOString(),
  });
});

// ── Pricing Endpoints ─────────────────────────────────────────────
router.post('/calculate', (req, res) => controller.calculatePrice(req, res));
router.post('/quotes', (req, res) => controller.createQuote(req, res));
router.post('/quotes/recalculate', (req, res) => controller.recalculateQuote(req, res));
router.get('/rules/resolve', (req, res) => controller.resolveRule(req, res));

// ── Super Admin CRUD on pricing configs (RBAC) ────────────────────
// ایزوله زیر مسیر /configs تا احراز هویت super_admin فقط به مدیریت config
// اعمال شود و محاسبهٔ قیمت (general) عمومی باقی بماند.
const pricingConfigRoutes = require('./pricing.config.routes');
router.use('/configs', pricingConfigRoutes);

module.exports = router;