const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.PG_HOST || '127.0.0.1',
  port: parseInt(process.env.PG_PORT, 10) || 5432,
  database: process.env.PG_DATABASE || 'safar_service',
  user: process.env.PG_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
  password: process.env.PG_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
});

const initAdsDB = async () => {
  try {
    // Create advertisers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS advertisers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID UNIQUE NOT NULL,
        company_name VARCHAR(255) NOT NULL,
        description TEXT,
        logo_url VARCHAR(512),
        phone VARCHAR(20),
        email VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending',
        verification_status VARCHAR(20) DEFAULT 'unverified',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create campaigns table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS campaigns (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        advertiser_id UUID NOT NULL REFERENCES advertisers(id),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        budget DECIMAL(15,2) NOT NULL,
        spent DECIMAL(15,2) DEFAULT 0,
        start_date DATE,
        end_date DATE,
        targeting_criteria JSONB DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'draft',
        impressions INT DEFAULT 0,
        clicks INT DEFAULT 0,
        conversions INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create ads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        campaign_id UUID NOT NULL REFERENCES campaigns(id),
        advertiser_id UUID NOT NULL REFERENCES advertisers(id),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        image_url VARCHAR(512),
        video_url VARCHAR(512),
        landing_url VARCHAR(512),
        ad_type VARCHAR(50) DEFAULT 'image',
        status VARCHAR(20) DEFAULT 'draft',
        impressions INT DEFAULT 0,
        clicks INT DEFAULT 0,
        conversions INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create ad_impressions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ad_impressions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id UUID NOT NULL REFERENCES ads(id),
        user_id UUID,
        device_type VARCHAR(50),
        location POINT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create ad_clicks table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ad_clicks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ad_id UUID NOT NULL REFERENCES ads(id),
        user_id UUID,
        device_type VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log('[AdsDB] All tables initialized successfully');
  } catch (err) {
    console.error('[AdsDB] Initialization error:', err.message);
  }
};

module.exports = { pool, initAdsDB };
