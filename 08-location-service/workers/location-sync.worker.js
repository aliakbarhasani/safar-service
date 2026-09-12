/**
 * location-sync.worker.js - Background Worker برای Write-Behind Sync (P3-2)
 *
 * هر ۱ دقیقه بافر تاریخچه مکانی رانندگان را از Redis خوانده و به صورت
 * Bulk Insert در جدول `driver_location_history` در PostgreSQL ذخیره می‌کند.
 *
 * این Worker به صورت Fire-and-Forget اجرا می‌شود و خطاها لاگ می‌شوند
 * تا سرویس اصلی مختل نشود.
 */

const { getPool } = require('../../05-wallet-service/db/pg');

const SYNC_INTERVAL_MS = 60 * 1000; // 1 دقیقه
const BATCH_SIZE = 500; // حداکثر تعداد رکورد در هر دسته

class LocationSyncWorker {
  /**
   * @param {Object} deps
   * @param {Object} deps.locationService - سرویس مکان‌یابی (برای drain buffer)
   * @param {Object} [deps.pool] - PostgreSQL Pool (تزریقی برای تست)
   * @param {number} [deps.intervalMs] - فاصله زمانی بین اجراها
   */
  constructor({ locationService, pool = null, intervalMs = SYNC_INTERVAL_MS } = {}) {
    if (!locationService) {
      throw new Error('LocationSyncWorker: locationService is required');
    }
    this.locationService = locationService;
    this.pool = pool || getPool();
    this.intervalMs = intervalMs;
    this._timer = null;
    this._running = false;
  }

  /**
   * شروع زمان‌بندی Worker.
   * @returns {LocationSyncWorker}
   */
  start() {
    if (this._timer) return this;
    this._timer = setInterval(() => {
      this.sync().catch((err) => {
        console.error('[LocationSyncWorker] sync error:', err.message);
      });
    }, this.intervalMs);
    // اجرای اولیه بلافاصله
    this.sync().catch((err) => {
      console.error('[LocationSyncWorker] initial sync error:', err.message);
    });
    return this;
  }

  /**
   * توقف زمان‌بندی Worker.
   * @returns {LocationSyncWorker}
   */
  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    return this;
  }

  /**
   * یک چرخه Sync: خواندن از بافر + Bulk Insert در PostgreSQL.
   * @returns {Promise<{synced: number, remaining: number}>}
   */
  async sync() {
    if (this._running) return { synced: 0, remaining: 0, skipped: true };
    this._running = true;
    try {
      const records = await this.locationService.drainHistoryBuffer();
      if (!records || records.length === 0) {
        return { synced: 0, remaining: 0 };
      }

      const limited = records.slice(0, BATCH_SIZE);
      const synced = await this.bulkInsert(limited);
      const remaining = records.length - limited.length;

      if (remaining > 0) {
        console.warn(`[LocationSyncWorker] ${remaining} records remaining in buffer (batch size exceeded)`);
      }

      return { synced, remaining };
    } catch (err) {
      console.error('[LocationSyncWorker] sync failed:', err.message);
      throw err;
    } finally {
      this._running = false;
    }
  }

  /**
   * Bulk Insert رکوردها در جدول driver_location_history.
   * از UNNEST برای کارایی بالا استفاده می‌کند.
   * @param {Array<{driver_id: string, longitude: number, latitude: number, recorded_at: string}>} records
   * @returns {Promise<number>} تعداد رکوردهای درج‌شده
   */
  async bulkInsert(records) {
    if (!records || records.length === 0) return 0;
    if (!this.pool) {
      console.warn('[LocationSyncWorker] no PostgreSQL pool available, skipping bulk insert');
      return 0;
    }

    const driverIds = records.map((r) => r.driver_id);
    const longitudes = records.map((r) => r.longitude);
    const latitudes = records.map((r) => r.latitude);
    const recordedAts = records.map((r) => r.recorded_at);

    const query = `
      INSERT INTO driver_location_history (driver_id, longitude, latitude, recorded_at)
      SELECT * FROM UNNEST($1::uuid[], $2::float8[], $3::float8[], $4::timestamptz[])
      RETURNING id
    `;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(query, [driverIds, longitudes, latitudes, recordedAts]);
      await client.query('COMMIT');
      return result.rowCount;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}

/**
 * کارخانه ساخت Worker با dependency injection.
 * @param {Object} deps
 * @returns {LocationSyncWorker}
 */
function createLocationSyncWorker(deps = {}) {
  return new LocationSyncWorker(deps);
}

module.exports = { LocationSyncWorker, createLocationSyncWorker, SYNC_INTERVAL_MS, BATCH_SIZE };