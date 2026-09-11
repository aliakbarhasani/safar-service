/**
 * ownership-campaign.test.js
 *
 * تست Ownership Check تبلیغات (Advertiser Ownership):
 *  - 403 وقتی تبلیغ‌کننده‌ی غیرمالک تلاش به ویرایش کمپین کند
 *  - 200 وقتی مالک کمپین ویرایش کند
 *  - 200 وقتی admin (غیرمالک) ویرایش کند
 */

const CampaignController = require('../controllers/campaign.controller');

function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.body = payload;
    return res;
  });
  return res;
}

describe('Ads CampaignController - Advertiser Ownership Check', () => {
  let controller;
  let service;

  const OWNER = 'adv-owner-1';
  const OTHER = 'adv-other-2';

  beforeEach(() => {
    controller = new CampaignController();
    service = require('../services/campaign.service').prototype;
    jest.restoreAllMocks();
  });

  test('returns 403 when a non-owner advertiser tries to update', async () => {
    jest.spyOn(service, 'getCampaignById').mockResolvedValue({ id: 'c1', advertiserId: OWNER });
    const updateSpy = jest.spyOn(service, 'updateCampaign').mockResolvedValue({ id: 'c1' });

    const req = { params: { id: 'c1' }, body: { name: 'Hacked' }, user: { userId: OTHER, role: 'advertiser' } };
    const res = makeRes();
    await controller.updateCampaign(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('allows the owner advertiser to update (200)', async () => {
    jest.spyOn(service, 'getCampaignById').mockResolvedValue({ id: 'c1', advertiserId: OWNER });
    const updateSpy = jest.spyOn(service, 'updateCampaign').mockResolvedValue({ id: 'c1', name: 'New' });

    const req = { params: { id: 'c1' }, body: { name: 'New' }, user: { userId: OWNER, role: 'advertiser' } };
    const res = makeRes();
    await controller.updateCampaign(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith('c1', { name: 'New' });
  });

  test('allows admin (non-owner) to update (200)', async () => {
    jest.spyOn(service, 'getCampaignById').mockResolvedValue({ id: 'c1', advertiserId: OWNER });
    const updateSpy = jest.spyOn(service, 'updateCampaign').mockResolvedValue({ id: 'c1' });

    const req = { params: { id: 'c1' }, body: { name: 'AdminEdit' }, user: { userId: OTHER, role: 'admin' } };
    const res = makeRes();
    await controller.updateCampaign(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalled();
  });
});
