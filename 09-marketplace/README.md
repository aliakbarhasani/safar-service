# 09-marketplace | Marketplace Service

## مسئولیت‌های سرویس

- **مدیریت محصولات** (Products)
- **مدیریت فروشندگان** (Sellers)
- **مدیریت دسته‌بندی‌ها** (Categories)
- **جستجو و فیلتر** (Search & Filtering)
- **مدیریت نظرات و امتیازات** (Reviews & Ratings)

## ارتباطات بین‌ماژولی

- **مرتبط با**: `03-user-service` (کاربران/فروشندگان)
- **مرتبط با**: `05-wallet-service` (پرداخت‌های فروش)
- **مرتبط با**: `13-logging-system` (لاگ‌های معاملات)
- **توسط**: `02-api-gateway` مدیریت می‌شود

## معماری

```
09-marketplace/
├── README.md
├── package.json
├── controllers/
│   ├── product.controller.js
│   ├── seller.controller.js
│   └── review.controller.js
├── models/
│   ├── product.model.js
│   ├── seller.model.js
│   └── review.model.js
├── services/
│   ├── product.service.js
│   ├── seller.service.js
│   └── search.service.js
├── routes/
│   ├── product.route.js
│   ├── seller.route.js
│   └── marketplace.route.js
└── db/
    └── marketplace.db.js
```

## API Endpoints

### محصولات
- `GET /api/v1/marketplace/products` - دریافت تمام محصولات
- `GET /api/v1/marketplace/products/:id` - دریافت جزئیات محصول
- `POST /api/v1/marketplace/products` - ایجاد محصول (فروشنده)
- `PATCH /api/v1/marketplace/products/:id` - بروزرسانی محصول
- `DELETE /api/v1/marketplace/products/:id` - حذف محصول

### فروشندگان
- `GET /api/v1/marketplace/sellers` - دریافت فروشندگان
- `GET /api/v1/marketplace/sellers/:id` - پروفایل فروشنده
- `POST /api/v1/marketplace/sellers/register` - ثبت فروشنده جدید

### نظرات
- `GET /api/v1/marketplace/reviews/:productId` - نظرات محصول
- `POST /api/v1/marketplace/reviews` - ثبت نظر جدید

## دیتابیس

جداول اصلی:
- `sellers` - فروشندگان
- `products` - محصولات
- `categories` - دسته‌بندی‌ها
- `reviews` - نظرات و امتیازات

## توسعه

توسط تیم Marketplace - SAFAR SERVICE
