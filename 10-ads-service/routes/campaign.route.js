const express = require('express');
const CampaignController = require('../controllers/campaign.controller');
const { authenticate, authorize } = require('../../13-auth-management/presentation/middleware/auth.middleware');

const router = express.Router();
const campaignController = new CampaignController();

// Protected routes (require authentication)
// RBAC: فقط تبلیغ‌کنندگان (یا مدیران) که پروفایل Advertiser دارند مجاز به ایجاد کمپین هستند
router.get('/', authenticate, (req, res) => campaignController.getCampaigns(req, res));
router.get('/:id', authenticate, (req, res) => campaignController.getCampaign(req, res));
router.post('/', authenticate, authorize('advertiser', 'admin', 'super_admin'), (req, res) => campaignController.createCampaign(req, res));

module.exports = router;
