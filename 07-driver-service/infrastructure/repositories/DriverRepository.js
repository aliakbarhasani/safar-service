/**
 * DriverRepository.js - PostgreSQL Data Access Layer for the Driver module
 *
 * لایه‌ی Repository با اصول Clean Architecture:
 *   - نگاشت رکورد SQL (snake_case) به انتیتی (camelCase)
 *   - هیچ منطق تجاری اینجا نیست؛ فقط کوئری‌های CRUD
 *
 * اتصال از `pg` Pool (مشترک از 14-config-system) تزریق می‌شود (DIP)؛
 * بدون fallback درون‌حافظه‌ای — PostgreSQL تنها منبع حقیقت است.
 */

const { Pool } = require('pg');
const config = require('../../../14-config-system/server.config');

let defaultPool = null;

/**
 * ساخت Pool پیش‌فرض (lazy) از کانفیگ مرکزی
 * @returns {import('pg').Pool}
 */
function getDefaultPool() {
  if (!defaultPool) {
    defaultPool = new Pool({
      host: config.pg.host,
      port: config.pg.port,
      database: config.pg.database,
      user: config.pg.user,
      password: config.pg.password,
      max: config.pg.max,
      idleTimeoutMillis: config.pg.idleTimeoutMillis,
      connectionTimeoutMillis: config.pg.connectionTimeoutMillis,
    });
  }
  return defaultPool;
}

/**
 * ستون‌های قابل درج در جدول drivers (بدون ستون‌های با مقدار پیش‌فرض خودکار)
 */
const DRIVER_INSERT_COLUMNS = [
  'user_id', 'first_name', 'last_name', 'phone_number', 'date_of_birth', 'address',
  'vehicle_type', 'license_plate', 'chassis_number',
  'vehicle_identification_number', 'license_number', 'identity_card_number',
  'identity_card_url', 'selfie_url', 'driving_license_url', 'transit_pass_url',
  'vehicle_card_url',
  'license_expiry_date', 'insurance_expiry_date', 'registration_expiry_date',
];

/**
 * نگاشت رکورد ستون‌های SQL به انتیتی camelCase برای لایه سرویس
 * @param {Object} r - رکورد خام pg
 * @returns {Object|null}
 */
function mapRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    _id: r.id, // backward-compat alias
    userId: r.user_id,
    firstName: r.first_name,
    lastName: r.last_name,
    phoneNumber: r.phone_number,
    dateOfBirth: r.date_of_birth,
    address: r.address,
    accountStatus: r.account_status,
    operationalStatus: r.operational_status,
    rating: r.rating != null ? Number(r.rating) : 5.0,
    ratingCount: r.rating_count != null ? r.rating_count : 0,
    completedTrips: r.completed_trips != null ? r.completed_trips : 0,
    cancelledTrips: r.cancelled_trips != null ? r.cancelled_trips : 0,
    currentLocation: {
      latitude: r.current_location_latitude != null ? Number(r.current_location_latitude) : 0,
      longitude: r.current_location_longitude != null ? Number(r.current_location_longitude) : 0,
    },
    lastSeenAt: r.last_seen_at,
    vehicleType: r.vehicle_type,
    licensePlate: r.license_plate,
    chassisNumber: r.chassis_number,
    vehicleIdentificationNumber: r.vehicle_identification_number,
    licenseNumber: r.license_number,
    identityCardNumber: r.identity_card_number,
    identityCardUrl: r.identity_card_url,
    selfieUrl: r.selfie_url,
    drivingLicenseUrl: r.driving_license_url,
    transitPassUrl: r.transit_pass_url,
    vehicleCardUrl: r.vehicle_card_url,
    licenseExpiryDate: r.license_expiry_date,
    insuranceExpiryDate: r.insurance_expiry_date,
    registrationExpiryDate: r.registration_expiry_date,
    countryId: r.country_id,
    documents: [], // جداول فرعی (driver_documents) در لایه‌های بعدی واکشی می‌شود
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    deletedAt: r.deleted_at,
  };
}

const SELECT_DRIVER_SQL = 'SELECT * FROM drivers WHERE deleted_at IS NULL';

class DriverRepository {
  /**
   * @param {import('pg').Pool} [pool] - تزریق pool (برای تست)
   */
  constructor(pool = null) {
    this.pool = pool || getDefaultPool();
  }

  /** یافتن راننده بر اساس شماره تلفن (ایندکس یکتای جزئی) */
  async findByPhoneNumber(phoneNumber) {
    const { rows } = await this.pool.query(
      `${SELECT_DRIVER_SQL} AND phone_number = $1 LIMIT 1`,
      [phoneNumber],
    );
    return mapRow(rows[0]);
  }

  /** یافتن راننده بر اساس شناسه UUID */
  async findById(driverId) {
    const { rows } = await this.pool.query(
      `${SELECT_DRIVER_SQL} AND id = $1 LIMIT 1`,
      [driverId],
    );
    return mapRow(rows[0]);
  }

  /** یافتن پروفایل راننده بر اساس شناسه حساب کاربری احرازشده. */
  async findByUserId(userId) {
    if (!userId) return null;
    const { rows } = await this.pool.query(
      `${SELECT_DRIVER_SQL} AND user_id = $1 LIMIT 1`,
      [userId],
    );
    return mapRow(rows[0]);
  }

  /** درج راننده جدید. `data.userId` الزامی است (FK به users). */
  async create(data) {
    if (!data.userId) {
      const err = new Error('userId is required to create a driver profile');
      err.code = 'DRIVER_USER_ID_REQUIRED';
      throw err;
    }
    const values = [
      data.userId,
      data.firstName, data.lastName, data.phoneNumber, data.dateOfBirth, data.address || '',
      data.vehicleType || '', data.licensePlate || '', data.chassisNumber || '',
      data.vehicleIdentificationNumber || '', data.licenseNumber || '', data.identityCardNumber || '',
      data.identityCardUrl || '', data.selfieUrl || '', data.drivingLicenseUrl || '',
      data.transitPassUrl || '', data.vehicleCardUrl || '',
      data.licenseExpiryDate || null, data.insuranceExpiryDate || null, data.registrationExpiryDate || null,
    ];
    const placeholders = values.map((_, i) => `$${i + 1}`);
    const { rows } = await this.pool.query(
      `INSERT INTO drivers (${DRIVER_INSERT_COLUMNS.join(', ')})
       VALUES (${placeholders.join(', ')})
       RETURNING *`,
      values,
    );
    return mapRow(rows[0]);
  }

  /** به‌روزرسانی accountStatus */
  async updateAccountStatus(driverId, newStatus) {
    const { rows } = await this.pool.query(
      `UPDATE drivers
         SET account_status = $2, updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [driverId, newStatus],
    );
    return mapRow(rows[0]);
  }

  /** به‌روزرسانی operationalStatus (اختیاری به‌روزرسانی last_seen_at) */
  async updateOperationalStatus(driverId, newStatus, { lastSeenAt = null } = {}) {
    const { rows } = await this.pool.query(
      `UPDATE drivers
         SET operational_status = $2,
             updated_at = NOW(),
             last_seen_at = COALESCE($3, last_seen_at)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [driverId, newStatus, lastSeenAt],
    );
    return mapRow(rows[0]);
  }

  /** به‌روزرسانی موقعیت مکانی و آخرین حضور */
  async updateLocation(driverId, latitude, longitude) {
    const { rows } = await this.pool.query(
      `UPDATE drivers
         SET current_location_latitude = $2,
             current_location_longitude = $3,
             last_seen_at = NOW(),
             updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [driverId, latitude, longitude],
    );
    return mapRow(rows[0]);
  }

  /** دریافت تمام رانندگان فعال */
  async findAll() {
    const { rows } = await this.pool.query(
      `${SELECT_DRIVER_SQL} ORDER BY created_at DESC`,
    );
    return rows.map(mapRow);
  }
}

module.exports = { DriverRepository, mapRow, getDefaultPool };