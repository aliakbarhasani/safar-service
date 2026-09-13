'use strict';

/**
 * ConfigController.js — کنترلر مدیریت تنظیمات پویا (P10-1)
 *
 * روت‌های:
 *   GET  /api/v1/admin/configs     → دریافت تمام تنظیمات پویا
 *   GET  /api/v1/admin/configs/:key → دریافت یک تنظیم
 *   PATCH /api/v1/admin/configs    → به‌روزرسانی تنظیمات
 */

class ConfigController {
  /**
   * @param {Object} deps
   * @param {DynamicConfigStore} deps.configStore
   * @param {string[]} [deps.editableKeys] — لیست کلیدهای مجاز برای ویرایش
   */
  constructor({ configStore, editableKeys = [] } = {}) {
    if (!configStore) {
      throw new Error('ConfigController: configStore is required');
    }
    this.configStore = configStore;
    this.editableKeys = editableKeys;
  }

  /**
   * GET /configs — دریافت تمام تنظیمات
   */
  async getAll(req, res) {
    try {
      const keys = this.editableKeys.length > 0
        ? this.editableKeys
        : ['trip.baseFare', 'trip.perKmRate', 'trip.maxSurge', 'wallet.currency'];
      const flat = await this.configStore.getMultiple(keys);
      const nested = {};
      for (const [key, value] of Object.entries(flat)) {
        const parts = key.split('.');
        let cur = nested;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!(parts[i] in cur)) cur[parts[i]] = {};
          cur = cur[parts[i]];
        }
        cur[parts[parts.length - 1]] = value;
      }
      return res.json({ success: true, data: nested });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * GET /configs/:key — دریافت یک تنظیم
   */
  async getOne(req, res) {
    try {
      const { key } = req.params;
      const value = await this.configStore.getConfig(key);
      if (value == null) {
        return res.status(404).json({ success: false, error: 'Config not found' });
      }
      return res.json({ success: true, data: { key, value } });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * PATCH /configs — به‌روزرسانی تنظیمات
   */
  async update(req, res) {
    try {
      const updates = req.body;
      if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, error: 'No updates provided' });
      }

      const results = {};
      const errors = [];

      for (const [key, value] of Object.entries(updates)) {
        // بررسی مجاز بودن کلید
        if (this.editableKeys.length > 0 && !this.editableKeys.includes(key)) {
          errors.push(`Key '${key}' is not editable`);
          continue;
        }
        await this.configStore.setConfig(key, value);
        results[key] = value;
      }

      if (errors.length > 0 && Object.keys(results).length === 0) {
        return res.status(400).json({ success: false, errors });
      }

      return res.json({ success: true, data: results, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = { ConfigController };
