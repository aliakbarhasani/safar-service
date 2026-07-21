/**
 * trip-location.model.js - مدل ثبت نقاط جغرافیایی سفر
 * 
 * این جدول نقاط مسیر سفر را ثبت می‌کند:
 *   - مبدأ (origin)، مقصد (destination)
 *   - نقاط میانی مسیر (waypoint) برای توقف‌های بین راه
 *   - موقعیت لحظه‌ای راننده (driver_location) در طول سفر
 *   - نقاط تحویل (delivery_stop) برای سرویس‌های freight/delivery
 *   - Timestamp هر نقطه برای محاسبه مسافت و زمان
 * 
 * پشتیبانی از ۶ نوع سرویس:
 *   taxi, intercity, border_transport, freight, delivery, tourism
 */

const pg = require('../db/pg');

const TABLE = 'trip_locations';
const COLUMNS = [
  'id', 'trip_id', 'point_type',
  'latitude', 'longitude', 'address',
  'recorded_at', 'created_at'
];
const COLUMNS_SELECT = COLUMNS.join(', ');

/**
 * ثبت یک نقطه مکانی برای سفر
 * 
 * @param {Object} data
 * @param {string} data.tripId - شناسه سفر
 * @param {string} data.pointType - نوع نقطه (origin, destination, waypoint, driver_location, delivery_stop, border_crossing)
 * @param {number} data.latitude - عرض جغرافیایی
 * @param {number} data.longitude - طول جغرافیایی
 * @param {string} [data.address] - آدرس
 * @param {Date} [data.recordedAt] - زمان ثبت
 */
async function create(data) {
  const {
    tripId, pointType,
    latitude, longitude, address = null,
    recordedAt = new Date()
  } = data;

  const result = await pg.query(
    `INSERT INTO ${TABLE} (trip_id, point_type, latitude, longitude, address, recorded_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS_SELECT}`,
    [tripId, pointType, latitude, longitude, address, recordedAt]
  );
  return result.rows[0];
}

/**
 * دریافت تمام نقاط یک سفر (مرتب بر اساس زمان)
 */
async function findByTripId(tripId) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE trip_id = $1 ORDER BY recorded_at ASC`,
    [tripId]
  );
  return result.rows;
}

/**
 * دریافت آخرین نقطه ثبت شده برای یک سفر
 */
async function findLatestByTripId(tripId) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE trip_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [tripId]
  );
  return result.rows[0] || null;
}

/**
 * دریافت نقاط بر اساس نوع
 * 
 * انواع پشتیبانی شده:
 *   - origin: مبدأ سفر
 *   - destination: مقصد نهایی
 *   - waypoint: نقطه میانی مسیر
 *   - driver_location: موقعیت لحظه‌ای راننده
 *   - delivery_stop: نقطه تحویل (برای freight/delivery)
 *   - border_crossing: نقطه عبور مرزی (برای border_transport)
 *   - tourism_stop: توقف گردشگری (برای tourism)
 */
async function findByType(tripId, pointType) {
  const result = await pg.query(
    `SELECT ${COLUMNS_SELECT} FROM ${TABLE} WHERE trip_id = $1 AND point_type = $2 ORDER BY recorded_at ASC`,
    [tripId, pointType]
  );
  return result.rows;
}

/**
 * دریافت نقاط تحویل برای سرویس‌های freight/delivery
 */
async function findDeliveryStops(tripId) {
  return await findByType(tripId, 'delivery_stop');
}

/**
 * دریافت نقاط عبور مرزی برای border_transport
 */
async function findBorderCrossings(tripId) {
  return await findByType(tripId, 'border_crossing');
}

/**
 * دریافت نقاط توقف گردشگری برای tourism
 */
async function findTourismStops(tripId) {
  return await findByType(tripId, 'tourism_stop');
}

module.exports = {
  create,
  findByTripId,
  findLatestByTripId,
  findByType,
  findDeliveryStops,
  findBorderCrossings,
  findTourismStops,
};