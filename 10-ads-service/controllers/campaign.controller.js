const CampaignService = require('../services/campaign.service');

const campaignService = new CampaignService();

class CampaignController {
  async getCampaigns(req, res) {
    try {
      const advertiserId = req.user?.userId;

      if (!advertiserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const campaigns = await campaignService.getCampaignsByAdvertiser(advertiserId);

      return res.status(200).json({
        success: true,
        data: campaigns,
      });
    } catch (err) {
      console.error('[CampaignController] getCampaigns error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async getCampaign(req, res) {
    try {
      const { id } = req.params;
      const callerId = req.user?.userId || req.user?.id;
      const callerRole = String(req.user?.role || '').toLowerCase();
      const isAdmin = callerRole === 'admin' || callerRole === 'super_admin';

      if (!callerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const campaign = await campaignService.getCampaignById(id);
      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // Campaign data is tenant-scoped: only its advertiser or an administrator may read it.
      if (!isAdmin && String(campaign.advertiserId) !== String(callerId)) {
        return res.status(403).json({ error: 'Forbidden: you are not the owner of this campaign' });
      }

      return res.status(200).json({ success: true, data: campaign });
    } catch (err) {
      console.error('[CampaignController] getCampaign error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async createCampaign(req, res) {
    try {
      const { name, description, budget, startDate, endDate, targetingCriteria } = req.body;
      const advertiserId = req.user?.userId;

      if (!advertiserId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const campaign = await campaignService.createCampaign({
        advertiserId,
        name,
        description,
        budget,
        startDate,
        endDate,
        targetingCriteria,
      });

      return res.status(201).json({ success: true, data: campaign });
    } catch (err) {
      console.error('[CampaignController] createCampaign error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async updateCampaign(req, res) {
    try {
      const { id } = req.params;
      const callerId = req.user?.userId || req.user?.id;
      const callerRole = String(req.user?.role || '').toLowerCase();
      const isAdmin = callerRole === 'admin' || callerRole === 'super_admin';

      if (!callerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const existing = await campaignService.getCampaignById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      // SECURITY (Advertiser Ownership Check): فقط مالک کمپین یا ادمین مجاز به ویرایش است
      if (!isAdmin && String(existing.advertiserId) !== String(callerId)) {
        return res.status(403).json({ error: 'Forbidden: you are not the owner of this campaign' });
      }

      // جلوگیری از انتقال مالکیت از طریق بادی
      const { advertiserId: _a, advertiser_id: _a2, ...safeUpdates } = req.body || {};
      const campaign = await campaignService.updateCampaign(id, safeUpdates);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
      }

      return res.status(200).json({ success: true, data: campaign });
    } catch (err) {
      console.error('[CampaignController] updateCampaign error:', err);
      return res.status(400).json({ error: err.message });
    }
  }
}

module.exports = CampaignController;
