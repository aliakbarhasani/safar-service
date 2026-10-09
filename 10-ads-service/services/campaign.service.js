const { Pool } = require('pg');
const Campaign = require('../models/campaign.model');

class CampaignService {
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
        // Never fall back to weak default database credentials in production.
        user: process.env.PG_USER || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        password: process.env.PG_PASSWORD || (process.env.NODE_ENV === 'production' ? undefined : 'postgres'),
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
    } catch (err) {
      console.warn('[CampaignService] PostgreSQL init failed:', err.message);
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

  async getCampaignsByAdvertiser(advertiserId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return [];

    try {
      const result = await this.pool.query(
        'SELECT * FROM campaigns WHERE advertiser_id = $1 ORDER BY created_at DESC',
        [advertiserId]
      );

      return result.rows.map(row => new Campaign({
        id: row.id,
        advertiserId: row.advertiser_id,
        name: row.name,
        description: row.description,
        budget: row.budget,
        spent: row.spent,
        startDate: row.start_date,
        endDate: row.end_date,
        targetingCriteria: row.targeting_criteria,
        status: row.status,
        impressions: row.impressions,
        clicks: row.clicks,
        conversions: row.conversions,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    } catch (err) {
      console.error('[CampaignService] getCampaignsByAdvertiser error:', err.message);
      return [];
    }
  }

  async getCampaignById(campaignId) {
    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    try {
      const result = await this.pool.query(
        'SELECT * FROM campaigns WHERE id = $1',
        [campaignId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        return new Campaign({
          id: row.id,
          advertiserId: row.advertiser_id,
          name: row.name,
          description: row.description,
          budget: row.budget,
          spent: row.spent,
          startDate: row.start_date,
          endDate: row.end_date,
          targetingCriteria: row.targeting_criteria,
          status: row.status,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      return null;
    } catch (err) {
      console.error('[CampaignService] getCampaignById error:', err.message);
      return null;
    }
  }

  async createCampaign(campaignData) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const { advertiserId, name, description, budget, startDate, endDate, targetingCriteria } = campaignData;

    try {
      const result = await this.pool.query(
        `INSERT INTO campaigns (advertiser_id, name, description, budget, start_date, end_date, targeting_criteria, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', NOW())
         RETURNING *`,
        [advertiserId, name, description, budget, startDate, endDate, JSON.stringify(targetingCriteria)]
      );

      const row = result.rows[0];
      return new Campaign({
        id: row.id,
        advertiserId: row.advertiser_id,
        name: row.name,
        description: row.description,
        budget: row.budget,
        startDate: row.start_date,
        endDate: row.end_date,
        targetingCriteria: row.targeting_criteria,
        status: row.status,
        createdAt: row.created_at,
      });
    } catch (err) {
      console.error('[CampaignService] createCampaign error:', err.message);
      throw err;
    }
  }

  async updateCampaign(campaignId, updates) {
    const dbReady = await this._isDBReady();
    if (!dbReady) throw new Error('Database not available');

    const allowedFields = ['name', 'description', 'budget', 'start_date', 'end_date', 'targeting_criteria', 'status'];
    const setClauses = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates || {})) {
      const dbKey = key === 'startDate' ? 'start_date'
        : key === 'endDate' ? 'end_date'
        : key === 'targetingCriteria' ? 'targeting_criteria'
        : key;
      if (allowedFields.includes(dbKey)) {
        const stored = dbKey === 'targeting_criteria' && typeof value === 'object'
          ? JSON.stringify(value)
          : value;
        setClauses.push(`${dbKey} = $${idx++}`);
        values.push(stored);
      }
    }

    if (setClauses.length === 0) throw new Error('No valid fields to update');

    values.push(campaignId);
    const query = `UPDATE campaigns SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`;

    try {
      const result = await this.pool.query(query, values);
      if (result.rows.length > 0) {
        const row = result.rows[0];
        return new Campaign({
          id: row.id,
          advertiserId: row.advertiser_id,
          name: row.name,
          description: row.description,
          budget: row.budget,
          spent: row.spent,
          startDate: row.start_date,
          endDate: row.end_date,
          targetingCriteria: row.targeting_criteria,
          status: row.status,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: row.conversions,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        });
      }
      return null;
    } catch (err) {
      console.error('[CampaignService] updateCampaign error:', err.message);
      throw err;
    }
  }

  close() {
    if (this.pool) {
      this.pool.end();
    }
  }
}

module.exports = CampaignService;
