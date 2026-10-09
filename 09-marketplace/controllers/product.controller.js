const ProductService = require('../services/product.service');

const productService = new ProductService();

class ProductController {
  async listProducts(req, res) {
    try {
      const { limit = 20, offset = 0, categoryId, sellerId, minPrice, maxPrice } = req.query;
      const filters = { categoryId, sellerId, minPrice, maxPrice };

      const { products, total } = await productService.getAllProducts(
        parseInt(limit, 10),
        parseInt(offset, 10),
        filters
      );

      return res.status(200).json({
        success: true,
        data: {
          products,
          total,
          limit: parseInt(limit, 10),
          offset: parseInt(offset, 10),
        },
      });
    } catch (err) {
      console.error('[ProductController] listProducts error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async getProduct(req, res) {
    try {
      const { id } = req.params;
      const product = await productService.getProductById(id);

      // Public catalog must never expose products hidden by the seller/admin.
      if (!product || String(product.status || '').toLowerCase() !== 'active') {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.status(200).json({ success: true, data: product });
    } catch (err) {
      console.error('[ProductController] getProduct error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async createProduct(req, res) {
    try {
      const { name, description, categoryId, price, quantity, imageUrl } = req.body;
      const sellerId = req.user?.userId;

      if (!sellerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const product = await productService.createProduct({
        sellerId,
        name,
        description,
        categoryId,
        price,
        quantity,
        imageUrl,
      });

      return res.status(201).json({ success: true, data: product });
    } catch (err) {
      console.error('[ProductController] createProduct error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async updateProduct(req, res) {
    try {
      const { id } = req.params;
      const callerId = req.user?.userId || req.user?.id;
      const callerRole = String(req.user?.role || '').toLowerCase();
      const isAdmin = callerRole === 'admin' || callerRole === 'super_admin';

      if (!callerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const existing = await productService.getProductById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // SECURITY (Seller Ownership Check): فقط مالک محصول یا ادمین مجاز به ویرایش است
      if (!isAdmin && String(existing.sellerId) !== String(callerId)) {
        return res.status(403).json({ error: 'Forbidden: you are not the owner of this product' });
      }

      // جلوگیری از انتقال مالکیت از طریق بادی
      const { sellerId: _s, seller_id: _s2, ...safeUpdates } = req.body || {};
      const product = await productService.updateProduct(id, safeUpdates);

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.status(200).json({ success: true, data: product });
    } catch (err) {
      console.error('[ProductController] updateProduct error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async deleteProduct(req, res) {
    try {
      const { id } = req.params;
      const callerId = req.user?.userId || req.user?.id;
      const callerRole = String(req.user?.role || '').toLowerCase();
      const isAdmin = callerRole === 'admin' || callerRole === 'super_admin';

      if (!callerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const existing = await productService.getProductById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // SECURITY (Seller Ownership Check): فقط مالک محصول یا ادمین مجاز به حذف است
      if (!isAdmin && String(existing.sellerId) !== String(callerId)) {
        return res.status(403).json({ error: 'Forbidden: you are not the owner of this product' });
      }

      const deleted = await productService.deleteProduct(id);
      if (!deleted) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.status(200).json({ success: true, data: deleted });
    } catch (err) {
      console.error('[ProductController] deleteProduct error:', err);
      return res.status(400).json({ error: err.message });
    }
  }
}

module.exports = ProductController;
