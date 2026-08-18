/**
 * UserRegisteredHandler.js - Event Handler for the `UserRegistered` event
 *
 * طبق بند 8 سند مادر (رویدادها قلب سیستم هستند)، این هندلر به رویداد ثبت‌نام
 * کاربر جدید مشترک می‌شود و به‌محض اینکه کاربری با نقش `seller` یا `advertiser`
 * ثبت‌نام کند، به‌صورت خودکار پروفایل کسب‌وکار متناظر را در جدول‌های
 * `sellers` (ماژول Marketplace) یا `advertisers` (ماژول Ads) ایجاد می‌کند.
 *
 * رشته اتصال (Connecting the dots):
 * ---------------------------------------------------------------
 * جداول `products.seller_id` و `campaigns.advertiser_id` به ترتیب به
 * `sellers(id)` و `advertisers(id)` ارجاع می‌دهند (Foreign Key)، در حالی که
 * کنترلرها از `req.user.userId` (یعنی `users.id`) به‌عنوان مقدار ستون FK
 * استفاده می‌کنند. برای اینکه کاربر تازه‌ثبت‌نام‌شده بلافاصله بتواند محصول یا
 * کمپین ایجاد کند، پروفایل با `id = userId` ساخته می‌شود تا FK برقرار باشد.
 *
 * رویداد از طریق EventBus سینگلتون (EventEmitter) توزیع می‌شود؛ بنابراین این
 * هندلر باید در همان پروسسی که رویداد منتشر می‌شود (پروسس auth/main) ثبت شود.
 */

const { Pool } = require('pg');

// نقش هر ستون اجباری که باید هنگام ساخت پروفایل پر شود
const BUSINESS_ROLE_TO_PROFILE = {
  seller: { table: 'sellers', nameColumn: 'store_name' },
  advertiser: { table: 'advertisers', nameColumn: 'company_name' },
};

function buildPoolConfig() {
  return {
    host: process.env.PG_HOST || '127.0.0.1',
    port: parseInt(process.env.PG_PORT, 10) || 5432,
    database: process.env.PG_DATABASE || 'safar_service',
    user: process.env.PG_USER || 'postgres',
    password: process.env.PG_PASSWORD || 'postgres',
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };
}

class UserRegisteredHandler {
  /**
   * @param {import('pg').Pool} [opts.pool] - تزریق نمونه کانکشن برای تست
   * @param {Object} [opts.eventBus] - تزریق EventBus برای تست
   */
  constructor({ pool = null, eventBus = null } = {}) {
    // eslint-disable-next-line global-require
    this.eventBus = eventBus || require('../EventBus');
    this.pool = pool || new Pool(buildPoolConfig());
    this._registered = false;
    this._boundOnUserRegistered = (payload) => this.handle(payload);
  }

  /**
   * نقطه ورود رویداد. خروجی را wrap کرده تا خطای احتمالی دیتابیس،
   * روند ثبت‌نام کاربر را از کار نیندازد (رویداد به‌صورت fire-and-forget است).
   */
  async handle({ event, data, timestamp } = {}) {
    try {
      const businessRole = this._resolveBusinessRole(data);
      if (!businessRole) {
        // کاربر غیر از seller/advertiser است -> پروفایل کسب‌وکار لازم ندارد
        const role = data && (data.role || (data.meta && data.meta.requestedRole));
        return { created: false, reason: 'no_business_profile_needed', role: role || 'unknown' };
      }

      const profile = await this.createBusinessProfile(data, businessRole);
      return { created: true, role: businessRole, profileId: profile ? profile.id : null };
    } catch (err) {
      console.error(`[UserRegisteredHandler] Failed to provision ${data && data.role} profile:`, err && err.message);
      return { created: false, reason: 'error', message: err && err.message };
    }
  }

  _resolveBusinessRole(data) {
    if (!data) return null;
    // نقش نرمال‌شده کاربر در data.role قرار دارد (هم‌ارز meta.requestedRole)
    const role = (data.role || (data.meta && data.meta.requestedRole) || '').trim().toLowerCase();
    if (!Object.prototype.hasOwnProperty.call(BUSINESS_ROLE_TO_PROFILE, role)) return null;
    return role;
  }

  _profileName(data, role) {
    const personName = [data.firstName, data.lastName]
      .filter((v) => v && String(v).trim().length > 0)
      .map((v) => String(v).trim())
      .join(' ');

    if (role === 'seller') {
      return personName ? `${personName} Store` : 'Online Store';
    }
    return personName ? `${personName} Advertiser` : 'Advertiser';
  }

  /**
   * درج (idempotent) پروفایل فروشنده/تبلیغ‌کننده در جدول متناظر.
   * با درج صریح `id = userId` رشته اتصال به FK جدول‌های محصول و کمپین برقرار می‌شود.
   */
  async createBusinessProfile(data, role) {
    if (!data || !data.userId) return null;

    const mapping = BUSINESS_ROLE_TO_PROFILE[role];
    if (!mapping) return null;

    const dbReady = await this._isDBReady();
    if (!dbReady) return null;

    const userId = data.userId;
    const name = this._profileName(data, role);

    const result = await this.pool.query(
      `INSERT INTO ${mapping.table}
         (id, user_id, ${mapping.nameColumn}, status, verification_status)
       VALUES ($1, $2, $3, 'active', 'unverified')
       ON CONFLICT (user_id) DO NOTHING
       RETURNING id, user_id, ${mapping.nameColumn}, status`,
      [userId, userId, name]
    );

    const row = result.rows && result.rows[0] ? result.rows[0] : null;
    return row
      ? {
          id: row.id,
          userId: row.user_id,
          name: row[mapping.nameColumn],
          status: row.status,
        }
      : null;
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

  /**
   * ثبت اشتراک در رویداد `UserRegistered` (idempotent در سطح یک instance).
   */
  register() {
    if (!this._registered) {
      this.eventBus.on('UserRegistered', this._boundOnUserRegistered);
      this._registered = true;
    }
    return this;
  }
}

/**
 * Bootstrap: ساخت هندلر و ثبت اشتراک در رویداد.
 * برای اتصال خودکار در پروسس اصلی (server.js) و پروسس auth (run-server.js).
 */
function registerUserRegisteredHandler(opts = {}) {
  return new UserRegisteredHandler(opts).register();
}

module.exports = { UserRegisteredHandler, registerUserRegisteredHandler, BUSINESS_ROLE_TO_PROFILE };