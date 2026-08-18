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
      const campaign = await campaignService.getCampaignById(id);

      if (!campaign) {
        return res.status(404).json({ error: 'Campaign not found' });
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
}

module.exports = CampaignController;
