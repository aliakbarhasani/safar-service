const { Pool } = require('pg');
const Product = require('../models/product.model');

class ProductService {
  constructor() {
    this.pool = null;
    this._initPool();
  }

  _initPool() {
    try {
      this.pool = new Pool({
        host: process.env.PG_HOST || '127.0.0.1',
        port: parseInt(process.env.PG_PORT, 10) || 5432,
        database: process.env.PG_DATABASE || 'safar_service',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || 'postgres',
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[ProductService] PostgreSQL init failed:', err.message);
    }
  }

  async _isDBReady() {
    if (!this.pool) return false;
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  async getAllProducts(limit = 20, offset = 0, filters = {}) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return { products: [], total: 0 };

    try {
      let query = 'SELECT * FROM products WHERE status = $1';
      let params = ['active'];
      let paramCount = 2;

      if (filters.categoryId) {
        query += ` AND category_id = $${paramCount}`;
        params.push(filters.categoryId);
        paramCount++;
      }

      if (filters.sellerId) {
        query += ` AND seller_id = $${paramCount}`;
        params.push(filters.sellerId);
        paramCount++;
      }

      if (filters.minPrice) {
        query += ` AND price >= $${paramCount}`;
        params.push(filters.minPrice);
        paramCount++;
      }

      if (filters.maxPrice) {
        query += ` AND price <= $${paramCount}`;
        params.push(filters.maxPrice);
        paramCount++;
      }

      const countResult = await this.pool.query(`SELECT COUNT(*) as count FROM (${query}) as t`, params);
      const total = parseInt(countResult.rows[0].count, 10);

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(limit, offset);

      const result = await this.pool.query(query, params);
      const products = result.rows.map(row => new Product({
        id: row.id,
        sellerId: row.seller_id,
        name: row.name,
        description: row.description,
        categoryId: row.category_id,
        price: row.price,
        currency: row.currency,
        quantity: row.quantity,
        imageUrl: row.image_url,
        rating: row.rating,
        reviewCount: row.review_count,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      return { products, total };
    } catch (err) {
      console.error('[ProductService] getAllProducts error:', err.message);
      return { products: [], total: 0 };
    }
  }

  async getProductById(productId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    try {
      const result = await this.pool.query(
        'SELECT * FROM products WHERE id = $1',
        [productId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return new Product({
          id: row.id,
          sellerId: row.seller_id,
          name: row.name,
          description: row.description,
          categoryId: row.category_id,
          price: row.price,
          currency: row.currency,
          quantity: row.quantity,
          imageUrl: row.image_url,
          rating: row.rating,
          reviewCount: row.review_count,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      return null;
    } catch (err) {
      console.error('[ProductService] getProductById error:', err.message);
      return null;
    }
  }

  async createProduct(productData) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const { sellerId, name, description, categoryId, price, quantity, imageUrl } = productData;

    try {
      const result = await this.pool.query(
        `INSERT INTO products (seller_id, name, description, category_id, price, quantity, image_url, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', NOW())
         RETURNING *`,
        [sellerId, name, description, categoryId, price, quantity, imageUrl]
      );

      const row = result.rows[0];
      return new Product({
        id: row.id,
        sellerId: row.seller_id,
        name: row.name,
        description: row.description,
        categoryId: row.category_id,
        price: row.price,
        currency: row.currency,
        quantity: row.quantity,
        imageUrl: row.image_url,
        status: row.status,
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error('[ProductService] createProduct error:', err.message);
      throw err;
    }
  }

  async updateProduct(productId, updates) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const allowedFields = ['name', 'description', 'price', 'quantity', 'image_url', 'status'];
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbKey = key === 'imageUrl' ? 'image_url' : key;
      if (allowedFields.includes(dbKey)) {
        setClauses.push(`${dbKey} = $${idx++}`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) throw new Error('No valid fields to update');

    values.push(productId);
    const query = `UPDATE products SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return new Product({
          id: row.id,
          sellerId: row.seller_id,
          name: row.name,
          description: row.description,
          categoryId: row.category_id,
          price: row.price,
          currency: row.currency,
          quantity: row.quantity,
          imageUrl: row.image_url,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      return null;
    } catch (err) {
      console.error('[ProductService] updateProduct error:', err.message);
      throw err;
    }
  }

  async deleteProduct(productId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    try {
      const result = await this.pool.query(
        'DELETE FROM products WHERE id = $1 RETURNING *',
        [productId]
      );
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return new Product({
          id: row.id,
          sellerId: row.seller_id,
          name: row.name,
          description: row.description,
          categoryId: row.category_id,
          price: row.price,
          currency: row.currency,
          quantity: row.quantity,
          imageUrl: row.image_url,
          status: row.status,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      return null;
    } catch (err) {
      console.error('[ProductService] deleteProduct error:', err.message);
      throw err;
    }
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = ProductService;
