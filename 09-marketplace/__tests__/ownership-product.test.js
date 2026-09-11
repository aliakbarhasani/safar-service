/**
 * ownership-product.test.js
 *
 * تست Ownership Check بازارچه (Seller Ownership):
 *  - 403 وقتی فروشنده‌ی غیرمالک تلاش به ویرایش محصول کند
 *  - 200 وقتی مالک محصول ویرایش کند
 *  - 200 وقتی admin/super_admin (غیرمالک) ویرایش کند
 *  - عدم امکان انتقال مالکیت از طریق بادی (sellerId در بادی نادیده گرفته می‌شود)
 *  - 404 وقتی محصول وجود نداشته باشد
 */

const ProductController = require('../controllers/product.controller');

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

describe('Marketplace ProductController - Seller Ownership Check', () => {
  let controller;
  let service;

  const OWNER = 'seller-owner-1';
  const OTHER = 'seller-other-2';

  beforeEach(() => {
    controller = new ProductController();
    service = require('../services/product.service').prototype;
    jest.restoreAllMocks();
  });

  function mockProduct(ownerId) {
    jest.spyOn(service, 'getProductById').mockResolvedValue({ id: 'p1', sellerId: ownerId });
  }

  test('returns 403 when a non-owner seller tries to update', async () => {
    mockProduct(OWNER);
    const updateSpy = jest.spyOn(service, 'updateProduct').mockResolvedValue({ id: 'p1' });

    const req = { params: { id: 'p1' }, body: { name: 'Hacked' }, user: { userId: OTHER, role: 'seller' } };
    const res = makeRes();
    await controller.updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toMatch(/owner/i);
    expect(updateSpy).not.toHaveBeenCalled();
  });

  test('returns 403 when a non-owner seller tries to delete', async () => {
    mockProduct(OWNER);
    const deleteSpy = jest.spyOn(service, 'deleteProduct').mockResolvedValue({ id: 'p1' });

    const req = { params: { id: 'p1' }, user: { userId: OTHER, role: 'seller' } };
    const res = makeRes();
    await controller.deleteProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  test('allows the owner seller to update (200)', async () => {
    mockProduct(OWNER);
    const updateSpy = jest.spyOn(service, 'updateProduct').mockResolvedValue({ id: 'p1', name: 'New' });

    const req = { params: { id: 'p1' }, body: { name: 'New' }, user: { userId: OWNER, role: 'seller' } };
    const res = makeRes();
    await controller.updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalledWith('p1', { name: 'New' });
  });

  test('allows admin (non-owner) to update (200)', async () => {
    mockProduct(OWNER);
    const updateSpy = jest.spyOn(service, 'updateProduct').mockResolvedValue({ id: 'p1' });

    const req = { params: { id: 'p1' }, body: { name: 'AdminEdit' }, user: { userId: OTHER, role: 'admin' } };
    const res = makeRes();
    await controller.updateProduct(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(updateSpy).toHaveBeenCalled();
  });

  test('ignores sellerId in body (no ownership transfer)', async () => {
    mockProduct(OWNER);
    const updateSpy = jest.spyOn(service, 'updateProduct').mockResolvedValue({ id: 'p1' });

    const req = {
      params: { id: 'p1' },
      body: { name: 'X', sellerId: OTHER, seller_id: OTHER },
      user: { userId: OWNER, role: 'seller' },
    };
    const res = makeRes();
    await controller.updateProduct(req, res);

    expect(updateSpy).toHaveBeenCalledWith('p1', { name: 'X' });
  });

  test('returns 404 when product does not exist', async () => {
    jest.spyOn(service, 'getProductById').mockResolvedValue(null);
    const req = { params: { id: 'missing' }, body: {}, user: { userId: OWNER, role: 'seller' } };
    const res = makeRes();
    await controller.updateProduct(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});
