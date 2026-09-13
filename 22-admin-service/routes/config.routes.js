'use strict';

/**
 * config.routes.js — مسیرهای مدیریت تنظیمات پویا (P10-1)
 *
 * نیازمند authenticate + authorize('admin', 'super_admin')
 */

const express = require('express');

/**
 * @param {Object} deps
 * @param {ConfigController} deps.configController
 * @param {Function} deps.authenticate — میدلور احراز هویت
 * @param {Function} deps.authorize — میدلور کنترل دسترسی
 * @returns {express.Router}
 */
function createConfigRoutes({ configController, authenticate, authorize }) {
  const router = express.Router();

  // همه مسیرها نیازمند احراز هویت و نقش admin/super_admin
  router.use(authenticate);
  router.use(authorize('admin', 'super_admin'));

  router.get('/', (req, res) => configController.getAll(req, res));
  router.get('/:key', (req, res) => configController.getOne(req, res));
  router.patch('/', (req, res) => configController.update(req, res));

  return router;
}

module.exports = { createConfigRoutes };
