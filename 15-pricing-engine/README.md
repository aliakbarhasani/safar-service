# ماژول موتور قیمت‌گذاری (Pricing Engine)

ماژول مستقل قیمت‌گذاری پروژه «سفر سرویس».

## معماری

```
15-pricing-engine/
├── index.js                    # ورودی اصلی
├── README.md                   # این فایل
├── domain/                     # لایه دامنه (Domain Layer)
│   ├── index.js                # تجمیع exports
│   ├── entities/               # موجودیت‌های کسب‌وکار
│   │   ├── PricingRule.js      # قانون قیمت‌گذاری
│   │   ├── PriceQuote.js       # پیش‌فاکتور (Immutable)
│   │   └── DynamicMultiplier.js# ضریب پویا با سقف 3.5x
│   ├── valueObjects/           # اشیاء مقداری
│   │   └── PriceBreakdown.js   # تفکیک قیمت (Immutable)
│   └── interfaces/             # اینترفیس‌های انتزاعی
│       ├── IPricingEngine.js
│       ├── IRuleResolver.js
│       ├── ICurrencyProvider.js
│       ├── ICacheProvider.js
│       ├── IPricingEventPublisher.js
│       └── IPricingRepository.js
├── application/                # لایه کاربردی (Application Layer)
│   ├── index.js
│   ├── useCases/               # سناریوهای کاربردی
│   │   ├── GeneratePriceQuote.js
│   │   ├── RecalculatePrice.js
│   │   └── ResolvePricingRule.js
│   └── events/                 # قرارداد رویدادها
│       ├── EventContract.js
│       └── PricingEvents.js
├── infrastructure/             # لایه زیرساخت (Infrastructure Layer)
│   ├── index.js
│   └── db-pool-validator.js    # مدیریت اتصال PostgreSQL
└── __tests__/                  # تست‌های واحد
    └── pricing-engine.test.js
```

## اصول معماری

1. **Clean Architecture**: لایه Domain هیچ وابستگی به Infrastructure ندارد.
2. **Immutability**: PriceQuote و PriceBreakdown پس از ایجاد تغییرناپذیر هستند.
3. **Dependency Injection**: Use Caseها وابستگی‌ها را از constructor دریافت می‌کنند.
4. **Safety Ceiling**: DynamicMultiplier دارای سقف 3.5x برای جلوگیری از افزایش بی‌رویه قیمت.
5. **Testability**: متد `isValid(currentTime)` امکان تزریق زمان برای تست را فراهم می‌کند.
6. **Event-Driven**: تمام رویدادهای مهم از طریق EventContract منتشر می‌شوند.

## متغیرهای محیطی

| متغیر | پیش‌فرض | توضیح |
|---|---|---|
| `PG_HOST` | 127.0.0.1 | میزبان PostgreSQL |
| `PG_PORT` | 5432 | پورت PostgreSQL |
| `PG_DATABASE` | safar_service | نام دیتابیس |
| `PG_USER` | postgres | نام کاربری |
| `PG_PASSWORD` | postgres | رمز عبور |
| `PG_POOL_MAX` | 20 | حداکثر تعداد اتصالات همزمان |

## نحوه اجرای تست‌ها

```bash
node 15-pricing-engine/__tests__/pricing-engine.test.js
```

## نحوه اجرای میگریشن دیتابیس

```bash
node 00-infrastructure/database/migrations/run-all-migrations.js
```

## وابستگی‌ها

- `pg` >= 8.22.0 (برای اتصال به PostgreSQL)

## رویدادهای پشتیبانی‌شده

| نوع رویداد | توضیح |
|---|---|
| QuoteGenerated | پیش‌فاکتور جدید تولید شد |
| QuoteExpired | پیش‌فاکتور منقضی شد |
| QuoteUsed | پیش‌فاکتور استفاده شد |
| QuoteCancelled | پیش‌فاکتور لغو شد |
| QuoteRecalculated | قیمت مجدداً محاسبه شد |
| RuleCreated | قانون جدید ایجاد شد |
| RuleUpdated | قانون به‌روزرسانی شد |
| RuleDeleted | قانون حذف شد |
| SurgeActivated | افزایش قیمت فعال شد |
| SurgeDeactivated | افزایش قیمت غیرفعال شد |
| MultiplierUpdated | ضریب به‌روزرسانی شد |
| EngineConfigChanged | تنظیمات موتور تغییر کرد |
| EngineVersionChanged | نسخه موتور تغییر کرد |
