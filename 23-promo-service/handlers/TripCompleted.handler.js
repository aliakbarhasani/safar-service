'use strict';

/**
 * TripCompleted.handler.js - Promo Service (P10-2)
 *
 * به رویداد پایان سفر (`TripCompleted`) گوش می‌دهد. اگر سفر از یک کد تخفیف
 * استفاده کرده باشد:
 *   1) یک رکورد در جدول `promo_usages` ثبت می‌کند (ردیابی مصرف هر کاربر).
 *   2) `current_uses` کد را به‌صورت اتمیک یک واحد افزایش می‌دهد
 *      (`UPDATE ... SET current_uses = current_uses + 1`).
 *
 * برای جلوگیری از خطای عدم-اتمیسیته (race) میان ثبت مصرف و افزایش شمارنده،
 * هر دو عملیات داخل یک تراکنش PostgreSQL اجرا می‌شوند.
 */

class TripCompletedHandler {
  /**
   * @param {Object} deps
   * @param {PromoCode} deps.promoCodeModel   - مدل دسترسی promo_codes
   * @param {PromoUsage} deps.promoUsageModel - مدل دسترسی promo_usages
   * @param {Object} [deps.pool]              - پول اتصال PG برای تراکنش (اختیاری)
   * @param {Object} [deps.eventBus]          - EventBus اختیاری برای clean-up در تست
   * @param {string} [deps.eventName]         - نام رویداد موردنظر (پیش‌فرض TripCompleted)
   */
  constructor({ promoCodeModel, promoUsageModel, pool = null, eventBus = null, eventName = 'TripCompleted' }) {
    this.promoCodeModel = promoCodeModel;
    this.promoUsageModel = promoUsageModel;
    this.pool = pool;
    this.eventBus = eventBus;
    this.eventName = eventName;
    this._subscribed = false;
  }

  /**
   * منطق مصرف کد تخفیف در پایان سفر.
   * @param {Object} data پیلود رویداد (سفر تکمیل‌شده)
   */
  async handle({ tripId, passengerId, promoCode }) {
    if (!promoCode) return { consumed: false }; // سفر بدون کد تخفیف
    if (!tripId || !passengerId) {
      throw new Error('TripCompleted payload must include tripId and passengerId');
    }

    // برای اتمیسیته کامل، هر دو عملیات داخل یک تراکنش اجرا می‌شوند.
    // اگر pool تزریق نشده بود، عملیاتِ جداگانه (بدون تراکنش) اجرا می‌شوند.
    const runInTx = async (pool, fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
        throw err;
      } finally {
        client.release();
      }
    };

    const execute = async (executor) => {
      // ثبت مصرف
      await executor.query(
        'INSERT INTO promo_usages (user_id, promo_code, trip_id) VALUES ($1, $2, $3)',
        [passengerId, promoCode, tripId]
      );
      // افزایش اتمیک شمارنده کل کد
      await executor.query(
        'UPDATE promo_codes SET current_uses = current_uses + 1, updated_at = NOW() WHERE code = $1',
        [promoCode]
      );
    };

    if (this.pool && this.pool.connect) {
      await runInTx(this.pool, execute);
    } else {
      await execute(this.promoCodeModel.pool || { query: () => { throw new Error('no pool'); } });
    }

    return { consumed: true, tripId, promoCode, userId: passengerId };
  }

  /**
   * اشتراک در EventBus مرکزی (در صورت فراهم‌شدن).
   */
  subscribe() {
    if (!this.eventBus || !this.eventBus.on || this._subscribed) return;
    this.eventBus.on(this.eventName, (payload) => {
      // Central EventBus publishes { event, data, timestamp }; support both
      // the canonical envelope and direct payloads used by legacy callers.
      const eventData = payload && payload.data && payload.event
        ? payload.data
        : (payload || {});
      try {
        this.handle(eventData).catch((err) => {
          // خطای هندلر نباید به تولیدکننده رویداد منتقل شود
          if (this.eventBus && this.eventBus.logger) {
            this.eventBus.logger.error('TripCompletedHandler failed', err);
          } else {
            console.warn(`[promo] TripCompletedHandler failed: ${err.message}`);
          }
        });
      } catch (err) {
        console.warn(`[promo] TripCompletedHandler async error: ${err.message}`);
      }
    });
    this._subscribed = true;
  }
}

module.exports = { TripCompletedHandler };