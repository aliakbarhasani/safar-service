const express = require('express');
const ProductController = require('../controllers/product.controller');
const { authenticate, authorize } = require('../../13-auth-management/presentation/middleware/auth.middleware');

const router = express.Router();
const productController = new ProductController();

// Public routes
router.get('/', (req, res) => productController.listProducts(req, res));
router.get('/:id', (req, res) => productController.getProduct(req, res));

// Protected routes (require authentication)
// RBAC: فقط فروشندگان (یا مدیران) که پروفایل Seller دارند مجاز به ایجاد/ویرایش محصول هستند
router.post('/', authenticate, authorize('seller', 'admin', 'super_admin'), (req, res) => productController.createProduct(req, res));
router.patch('/:id', authenticate, authorize('seller', 'admin', 'super_admin'), (req, res) => productController.updateProduct(req, res));
// SECURITY (Seller Ownership Check در کنترلر): حذف محصول فقط توسط مالک یا ادمین
router.delete('/:id', authenticate, authorize('seller', 'admin', 'super_admin'), (req, res) => productController.deleteProduct(req, res));

module.exports = router;
