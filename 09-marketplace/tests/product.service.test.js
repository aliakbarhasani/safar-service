const ProductService = require('../services/product.service');

function serviceWithPool(query) {
  const service = new ProductService();
  service.pool = { query };
  return service;
}

describe('Marketplace product seller and input validation', () => {
  test('resolves an active seller profile for the authenticated user', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 'seller-profile-1' }] });
    const service = serviceWithPool(query);

    await expect(service.getActiveSellerIdForUser('user-1')).resolves.toBe('seller-profile-1');
    expect(query.mock.calls[1][0]).toContain("status = 'active'");
    expect(query.mock.calls[1][1]).toEqual(['user-1']);
  });

  test('checks ownership using seller profile ID and user account ID', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] })
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const service = serviceWithPool(query);

    await expect(service.isSellerOwner('seller-profile-1', 'user-1')).resolves.toBe(true);
    expect(query.mock.calls[1][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(query.mock.calls[1][1]).toEqual(['seller-profile-1', 'user-1']);
  });

  test('rejects non-positive prices before inserting a product', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const service = serviceWithPool(query);

    await expect(service.createProduct({
      sellerId: 'seller-profile-1',
      name: 'Test item',
      price: -1,
      quantity: 1,
    })).rejects.toThrow('Product price must be a positive number');
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('rejects negative or fractional inventory quantities', async () => {
    const query = jest.fn().mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const service = serviceWithPool(query);

    await expect(service.createProduct({
      sellerId: 'seller-profile-1',
      name: 'Test item',
      price: 10,
      quantity: -1,
    })).rejects.toThrow('Product quantity must be a non-negative integer');
    await expect(service.createProduct({
      sellerId: 'seller-profile-1',
      name: 'Test item',
      price: 10,
      quantity: 1.5,
    })).rejects.toThrow('Product quantity must be a non-negative integer');
    expect(query).toHaveBeenCalledTimes(1);
  });
});
