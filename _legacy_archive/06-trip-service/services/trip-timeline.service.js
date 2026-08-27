/**
 * trip-timeline.service.js - سرویس ثبت گاه‌شمار سفر
 * 
 * این سرویس مسئول ثبت تمام تغییرات وضعیت سفر در جدول trip_timeline است.
 * هر بار که وضعیت سفر تغییر می‌کند، یک رکورد در timeline ثبت می‌شود.
 * 
 * معماری:
 *   - ثبت در داخل تراکنش دیتابیس (همراه با تغییر وضعیت)
 *   - ذخیره موقعیت جغرافیایی در زمان تغییر
 *   - ذخیره metadata اضافی
 *   - تغییر خودکار از طریق DB trigger (fallback) + ثبت از طریق سرویس (primary)
 */

const pg = require('../db/pg');

/**
 * ثبت یک تغییر وضعیت در گاه‌شمار سفر
 * این تابع در داخل تراکنش دیتابیس صدا زده می‌شود
 * 
 * @param {Object} client - client تراکنش PostgreSQL
 * @param {string} tripId - شناسه سفر
 * @param {string} previousStatus - وضعیت قبلی
 * @param {string} newStatus - وضعیت جدید
 * @param {string} [changedBy] - شناسه کاربر تغییردهنده
 * @param {string} [changedByRole] - نقش تغییردهنده (passenger, driver, admin, system)
 * @param {string} [reason] - دلیل تغییر
 * @param {Object} [coordinates] - موقعیت جغرافیایی {latitude, longitude}
 * @param {Object} [metadata] - metadata اضافی
 */
async function recordTransition(client, tripId, previousStatus, newStatus, {
  changedBy = null,
  changedByRole = null,
  reason = null,
  coordinates = null,
  metadata = null,
} = {}) {
  const query = `
    INSERT INTO trip_timeline
    (trip_id, previous_status, new_status, changed_by, changed_by_role, reason,
     latitude, longitude, metadata)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id
  `;
  const params = [
    tripId,
    previousStatus,
    newStatus,
    changedBy,
    changedByRole,
    reason,
    coordinates?.latitude || null,
    coordinates?.longitude || null,
    metadata ? JSON.stringify(metadata) : '{}',
  ];

  const result = await client.query(query, params);
  return result.rows[0].id;
}

/**
 * دریافت گاه‌شمار یک سفر
 */
async function getTimeline(tripId) {
  const result = await pg.query(
    `SELECT id, previous_status, new_status, changed_by, changed_by_role,
            reason, latitude, longitude, metadata, created_at
     FROM trip_timeline
     WHERE trip_id = $1
     ORDER BY created_at ASC`,
    [tripId]
  );
  return result.rows;
}

/**
 * دریافت آخرین رکورد گاه‌شمار یک سفر
 */
async function getLatestTimelineEntry(tripId) {
  const result = await pg.query(
    `SELECT id, previous_status, new_status, changed_by, changed_by_role,
            reason, latitude, longitude, metadata, created_at
     FROM trip_timeline
     WHERE trip_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [tripId]
  );
  return result.rows[0] || null;
}

/**
 * دریافت تعداد تغییرات وضعیت یک سفر
 */
async function getTransitionCount(tripId) {
  const result = await pg.query(
    `SELECT COUNT(*) as total FROM trip_timeline WHERE trip_id = $1`,
    [tripId]
  );
  return parseInt(result.rows[0].total, 10);
}

module.exports = {
  recordTransition,
  getTimeline,
  getLatestTimelineEntry,
  getTransitionCount,
};