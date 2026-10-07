const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'safar_service',
  user: process.env.PG_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
  password: process.env.PG_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
});

const initMarketplaceDB = async () => {
  try {
    // Create sellers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sellers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL,
        store_name VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100),
        rating DECIMAL(2,1) DEFAULT 0,
        review_count INT DEFAULT 0,
        total_sales DECIMAL(15,2) DEFAULT 0,
        logo_url VARCHAR(512),
        cover_url VARCHAR(512),
        phone VARCHAR(20),
        email VARCHAR(255),
        address TEXT,
        status VARCHAR(20) DEFAULT 'pending',
        verification_status VARCHAR(20) DEFAULT 'unverified',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create products table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id UUID NOT NULL REFERENCES sellers(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        category_id VARCHAR(50),
        price DECIMAL(15,2) NOT NULL,
        currency VARCHAR(5) DEFAULT 'AFN',
        quantity INT DEFAULT 0,
        image_url VARCHAR(512),
        rating DECIMAL(2,1) DEFAULT 0,
        review_count INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create reviews table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reviews (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        product_id UUID NOT NULL REFERENCES products(id),
        user_id UUID NOT NULL,
        rating INT CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        verified_purchase BOOLEAN DEFAULT FALSE,
        helpful INT DEFAULT 0,
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('[MarketplaceDB] All tables initialized successfully');
  } catch (err) {
    console.error('[MarketplaceDB] Initialization error:', err.message);
  }
};

module.exports = { pool, initMarketplaceDB };
