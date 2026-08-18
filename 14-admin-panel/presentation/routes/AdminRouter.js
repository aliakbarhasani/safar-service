const express = require('express');
const AdminController = require('../controllers/AdminController');
const router = express.Router();
const ctrl = new AdminController();

// ── Health & Root ─────────────────────────────────────────────────
router.get('/health', (req, res) => ctrl.getHealth(req, res));
router.get('/', (req, res) => ctrl.getRoot(req, res));

// ── Dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', (req, res, next) => ctrl.getDashboard(req, res, next));

// ── User Management ───────────────────────────────────────────────
router.get('/users', (req, res, next) => ctrl.listUsers(req, res, next));
router.get('/users/:id', (req, res, next) => ctrl.getUser(req, res, next));
router.put('/users/:id/block', (req, res, next) => ctrl.blockUser(req, res, next));
router.put('/users/:id/unblock', (req, res, next) => ctrl.unblockUser(req, res, next));

// ── Trip Management ───────────────────────────────────────────────
router.get('/trips', (req, res, next) => ctrl.listTrips(req, res, next));
router.get('/trips/:id', (req, res, next) => ctrl.getTrip(req, res, next));
router.put('/trips/:id/cancel', (req, res, next) => ctrl.cancelTrip(req, res, next));

module.exports = router;