const express = require('express');
const router = express.Router();

// RBAC: ONLY super_admin can manage pricing configs
const { authenticate, authorize } = require('../../../13-auth-management/presentation/middleware/auth.middleware');

router.use(authenticate);
router.use(authorize('super_admin'));

// GET /api/v1/pricing/configs - list all pricing configs
router.get('/', (req, res) => {
  res.json({ success: true, status_code: 200, data: [], message: 'pricing configs list' });
});

// GET /api/v1/pricing/configs/:id - get one config
router.get('/:id', (req, res) => {
  const { id } = req.params;
  res.json({ success: true, status_code: 200, data: { id } });
});

// POST /api/v1/pricing/configs - create a config
router.post('/', (req, res) => {
  const body = req.body || {};
  res.json({
    success: true,
    status_code: 201,
    data: { id: Math.random().toString(36).slice(2, 10), name: body.name, service_type: body.service_type },
    message: 'created (placeholder - connect to DB)',
  });
});

// PUT /api/v1/pricing/configs/:id - update a config
router.put('/:id', (req, res) => {
  const { id } = req.params;
  res.json({ success: true, status_code: 200, data: { id, ...req.body }, message: 'updated (placeholder)' });
});

// DELETE /api/v1/pricing/configs/:id - soft-delete a config
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  res.json({ success: true, status_code: 200, data: { id, status: 'archived' }, message: 'archived (placeholder)' });
});

module.exports = router;