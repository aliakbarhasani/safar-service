# 10-ads-service | Advertising & Ads Management Service

## مسئولیت‌های سرویس

- **مدیریت تبلیغات** (Ads Management)
- **مدیریت کمپین‌ها** (Campaigns)
- **هدف‌بندی (Targeting)** - کاربران، مناطق، جنسیت، سن
- **ردیابی نتایج** (Analytics & Tracking)
- **مدیریت بودجه تبلیغ** (Budget Management)
- **نمایش تبلیغات** (Ad Display & Serving)

## ارتباطات بین‌ماژولی

- **مرتبط با**: `03-user-service` (داده‌های کاربران برای هدف‌بندی)
- **مرتبط با**: `05-wallet-service` (پرداخت بودجه تبلیغ)
- **مرتبط با**: `13-logging-system` (لاگ‌های نمایش و کلیک)
- **توسط**: `02-api-gateway` مدیریت می‌شود

## معماری

```
10-ads-service/
├── README.md
├── package.json
├── controllers/
│   ├── ad.controller.js
│   ├── campaign.controller.js
│   └── analytics.controller.js
├── models/
│   ├── ad.model.js
│   └── campaign.model.js
├── services/
│   ├── ad.service.js
│   ├── campaign.service.js
│   └── analytics.service.js
├── routes/
│   ├── ad.route.js
│   ├── campaign.route.js
│   └── ads.route.js
└── db/
    └── ads.db.js
```

## API Endpoints

### تبلیغات
- `GET /api/v1/ads` - دریافت تبلیغات (برای نمایش)
- `GET /api/v1/ads/:id` - جزئیات تبلیغ
- `POST /api/v1/ads` - ایجاد تبلیغ جدید (تبلیغ‌کننده)
- `PATCH /api/v1/ads/:id` - بروزرسانی تبلیغ
- `DELETE /api/v1/ads/:id` - حذف تبلیغ

### کمپین‌ها
- `GET /api/v1/campaigns` - دریافت کمپین‌های تبلیغی
- `POST /api/v1/campaigns` - ایجاد کمپین جدید
- `PATCH /api/v1/campaigns/:id` - بروزرسانی کمپین
- `GET /api/v1/campaigns/:id/analytics` - آمار و ارقام کمپین

### تحلیل
- `GET /api/v1/analytics/impressions` - نمایش‌های تبلیغ
- `GET /api/v1/analytics/clicks` - کلیک‌های تبلیغ
- `GET /api/v1/analytics/conversions` - تبدیل‌ها

## دیتابیس

جداول اصلی:
- `advertisers` - تبلیغ‌کنندگان
- `campaigns` - کمپین‌های تبلیغی
- `ads` - تبلیغات
- `ad_impressions` - نمایش‌های تبلیغات
- `ad_clicks` - کلیک‌های تبلیغات
- `ad_targeting` - هدف‌بندی تبلیغات

## توسعه

توسط تیم Ads - SAFAR SERVICE
