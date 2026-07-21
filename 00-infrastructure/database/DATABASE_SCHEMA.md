# DATABASE SCHEMA - Safar Service
**نسخه: طراحی نهایی پایگاه داده PostgreSQL (فاز چهارم - نهایی)**
**وضعیت: نهایی و لازم‌الاجرا**

## معماری کلی

این سند ساختار کامل پایگاه داده پروژه سفر سرویس را بر اساس اصول زیر توصیف می‌کند:

- **UUID Primary Keys:** تمام جداول از کلید اصلی UUID استفاده می‌کنند
- **Soft Delete:** فیلد `deleted_at` در تمام جداول اصلی
- **Multi-Country & Multi-Currency:** از ابتدا در سطح دیتابیس
- **ENUM Types:** تمام وضعیت‌ها به صورت ENUM
- **JSONB:** برای تنظیمات پویا و داده‌های انعطاف‌پذیر
- **RBAC:** کنترل دسترسی مبتنی بر نقش (Role-Based Access Control)
- **Proper Indexing:** ایندکس روی FKها و فیلدهای پرجستجو
- **Refresh Token Rotation:** مدیریت امن نشست‌های کاربران
- **Multi-Currency Finance:** تسویه‌حساب چندارزی رانندگان
- **Ticketing System:** سیستم پشتیبانی با پیگیری یکتا

---

## ERD (Entity Relationship Diagram) متنی

```
┌──────────────────────┐       ┌──────────────────────────────┐
│      currencies      │       │         countries            │
├──────────────────────┤       ├──────────────────────────────┤
│ PK │ id (UUID)      │◄──────│ FK │ currency_id              │
│    │ code (IRT/USD)  │       │ PK │ id (UUID)               │
│    │ exchange_rate   │       │    │ code (IR/AF/AE)         │
│    │ is_default      │       │    │ phone_prefix (+98)      │
└──────────┬───────────┘       └───────────┬──────────────────┘
           │                               │
           │          ┌────────────────────┼────────────────────┐
           │          │                    │                    │
           │   ┌──────▼─────────┐  ┌──────▼──────┐  ┌─────────▼──────────┐
           │   │     users      │  │   drivers   │  │      trips         │
           │   ├────────────────┤  ├─────────────┤  ├────────────────────┤
           │   │ PK │ id       │◄─│ FK │ user_id │  │ FK │ passenger_id  │◄── users
           │   │ phone_number   │  │ account_status │ FK │ driver_id      │◄── drivers
           │   │ role (ENUM)    │  │ operational   │    │ status (9-state)  │
           │   │ country_id     │  │ rating        │    │ origin/dest_coords│
           │   │ preferred_cur. │  │ location      │    │ base_fare         │
           │   │ deleted_at     │  │ license_expiry│    │ commission_*      │
           │   └──────┬─────────┘  │ insurance_exp │    │ driver_earning    │
           │          │            │ deleted_at    │    │ passenger_boarded │
           │          │            └──────┬────────┘    │ emergency_flag    │
           │          │                   │             │ cancel_reason     │
           │          │            ┌──────▼────────┐    │ currency_id       │
           │          │            │driver_documents│    │ deleted_at        │
           │          │            ├───────────────┤    └─────────┬──────────┘
           │          │            │ FK │ driver_id │              │
           │          │            │ doc_type       │              │
           │          │            │ url, verified  │              │
           │          │            └───────────────┘              │
           │          │                                          │
           │   ┌──────▼─────────┐  ┌─────────────────┐  ┌────────▼──────────┐
           │   │   addresses    │  │    reviews      │  │   user_coupons   │
           │   ├────────────────┤  ├─────────────────┤  ├──────────────────┤
           │   │ FK │ user_id   │  │ FK │ trip_id    │  │ FK │ user_id     │
           │   │ FK │ country_id│  │ FK │ reviewer_id│  │ FK │ coupon_id   │
           │   │ city, district │  │ FK │ reviewee_id│  │ FK │ trip_id     │
           │   │ lat/lng        │  │ rating (1-5)    │  │ used_at          │
           │   │ is_default     │  │ comment         │  └──────────────────┘
           │   │ deleted_at     │  │ deleted_at      │
           │   └────────────────┘  └─────────────────┘
           │
           │   ┌─────────────────┐      ┌──────────────────────┐
           │   │  notifications  │      │        files         │
           │   ├─────────────────┤      ├──────────────────────┤
           │   │ FK │ user_id    │      │ PK │ id (UUID)      │
           │   │ title, body     │      │ url, original_name   │
           │   │ type (ENUM)     │      │ mime_type, size      │
           │   │ is_read/read_at │      │ module, entity_type  │
           │   │ deleted_at      │      │ entity_id            │
           │   └─────────────────┘      │ FK │ uploaded_by     │
           │                            │ deleted_at           │
           │                            └──────────────────────┘
           │
           │   ┌─────────────────┐      ┌──────────────────────┐
           │   │   devices       │      │    sessions          │
           │   ├─────────────────┤      ├──────────────────────┤
           │   │ PK │ id (UUID)  │      │ PK │ id (UUID)      │
           │   │ device_id (UQ)  │      │ FK │ user_id        │
           │   │ fcm_token       │      │ FK │ device_id      │
           │   │ platform        │      │ refresh_token (UQ)  │
           │   │ device_model    │      │ ip_address          │
           │   │ os_version      │      │ is_revoked          │
           │   │ app_version     │      │ expires_at          │
           │   │ is_active       │      │ deleted_at          │
           │   │ deleted_at      │      └──────────────────────┘
           │   └────────┬────────┘
           │            │  (Many-to-Many)
           │   ┌────────▼────────┐
           │   │  user_devices   │
           │   ├─────────────────┤      ┌──────────────────────┐
           │   │ FK │ user_id    │      │     otp_codes       │
           │   │ FK │ device_id  │      ├──────────────────────┤
           │   │ is_primary      │      │ PK │ id (UUID)      │
           │   │ is_trusted      │      │ phone_number        │
           │   └─────────────────┘      │ code_hash           │
           │                            │ type (otp_type)     │
           │                            │ is_used             │
           │                            │ expires_at          │
           │                            └──────────────────────┘
           │
    ┌───────▼──────────┐       ┌──────────────────┐
    │     wallets      │       │    coupons       │
    ├──────────────────┤       ├──────────────────┤
    │ FK │ user_id     │       │ PK │ id (UUID)  │
    │ FK │ currency_id │       │ code (UNIQUE)    │
    │ balance          │       │ discount_type    │
    │ deleted_at       │       │ discount_value   │
    └───────┬──────────┘       │ max_discount     │
            │                  │ FK │ country_id  │
    ┌───────▼──────────┐       │ FK │ currency_id │
    │  transactions    │       │ starts_at/expires│
    ├──────────────────┤       │ is_active        │
    │ FK │ wallet_id   │       │ deleted_at       │
    │ FK │ trip_id     │       └──────────────────┘
    │ amount, type     │
    │ status           │
    └──────────────────┘

┌────────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│           driver_earnings                  │       │         driver_settlements           │
├────────────────────────────────────────────┤       ├──────────────────────────────────────┤
│ PK │ id (UUID)                             │       │ PK │ id (UUID)                       │
│ FK │ driver_id                             │◄─────►│ FK │ driver_id                       │
│ FK │ trip_id                               │       │ FK │ currency_id                     │
│ FK │ currency_id                           │       │ amount (BIGINT)                     │
│ FK │ settlement_id (nullable)              │       │ amount_in_default                  │
│ amount (BIGINT)                            │       │ fee_amount, net_amount             │
│ amount_in_default                         │       │ bank_account_number                │
│ earning_type (earnin_type)                 │       │ bank_name, bank_swift               │
│ is_settled (Boolean)                       │       │ FK │ wallet_id (nullable)           │
│ earned_at                                  │       │ status (settlement_status)          │
│ deleted_at                                 │       │ transaction_reference               │
└────────────────────────────────────────────┘       │ FK │ processed_by                   │
                                                      │ settlement_date, period            │
                                                      │ deleted_at                          │
                                                      └──────────────────────────────────────┘

┌────────────────────────────────────────────┐       ┌──────────────────────────────────────┐
│               tickets                      │       │          ticket_messages             │
├────────────────────────────────────────────┤       ├──────────────────────────────────────┤
│ PK │ id (UUID)                             │       │ PK │ id (UUID)                       │
│ FK │ user_id                               │       │ FK │ ticket_id                       │
│ FK │ assigned_to (nullable)                │       │ FK │ sender_id                       │
│ tracking_code (UNIQUE)                     │       │ message_text (TEXT)                 │
│ department (ticket_department)             │       │ message_type                       │
│ subject, description                       │       │ attachments (JSONB)                 │
│ priority (ticket_priority)                 │       │ is_internal (Boolean)               │
│ status (ticket_status)                     │       │ created_at                          │
│ related_entity_type/entity_id             │       └──────────────────────────────────────┘
│ is_escalated, escalated_at                │
│ FK │ escalated_to (nullable)              │
│ resolved_at, closed_at                    │
│ FK │ closed_by (nullable)                 │
│ deleted_at                                 │
└────────────────────────────────────────────┘

┌──────────────────────┐      ┌──────────────────────────┐       ┌─────────────────────────┐
│    system_configs    │      │      audit_logs          │       │    roles                │
├──────────────────────┤      ├──────────────────────────┤       ├─────────────────────────┤
│ PK │ id (UUID)      │      │ PK │ id (UUID)           │       │ PK │ id (UUID)          │
│    │ category        │      │    │ event_type           │       │    │ name (UNIQUE)       │
│    │ key             │      │    │ entity_type          │       │    │ display_name        │
│    │ value (JSONB)   │      │    │ entity_id            │       │    │ is_system           │
│    │ is_active       │      │    │ actor_id (FK users)  │       │    │ deleted_at          │
└──────────────────────┘      │    │ metadata (JSONB)     │       └──────────┬──────────────┘
                               │    │ created_at           │                  │
                               └──────────────────────────┘         ┌────────┴──────────────┐
                                                                    │   role_permissions    │
                                                                    ├───────────────────────┤
                                                                    │ PK │ role_id          │
                                                                    │ PK │ permission_id    │
                                                                    └───────────────────────┘
                                                            ┌────────┴──────────────┐
                                                            │    permissions        │
                                                            ├───────────────────────┤
                                                            │ PK │ id (UUID)       │
                                                            │    │ name (UNIQUE)    │
                                                            │    │ module           │
                                                            └───────────────────────┘

┌──────────────────────┐
│    user_roles        │
├──────────────────────┤
│ PK │ user_id         │
│ PK │ role_id         │
│ FK │ assigned_by     │
└──────────────────────┘
```

---

## لیست جداول

| # | نام جدول | توضیح | Soft Delete | Migration |
|---|----------|--------|-------------|-----------|
| 1 | `currencies` | ارزهای پشتیبانی شده (IRT, USD, AFN, ...) | ❌ | 001 |
| 2 | `countries` | کشورهای پشتیبانی شده (IR, AF, AE, ...) | ❌ | 001 |
| 3 | `users` | کاربران سیستم (مسافران، رانندگان، ادمین‌ها) | ✅ | 001 |
| 4 | `drivers` | پروفایل کامل رانندگان (۱۵+ فیلد) | ✅ | 001 |
| 5 | `driver_documents` | مدارک رانندگان (یک به چند) | ❌ | 001 |
| 6 | `trips` | سفرها (ماشین وضعیت ۹ حالته) | ✅ | 001 |
| 7 | `wallets` | کیف پول کاربران (چندارزی) | ✅ | 001 |
| 8 | `transactions` | تراکنش‌های مالی | ❌ | 001 |
| 9 | `system_configs` | تنظیمات پویای سیستم (JSONB) | ❌ | 001 |
| 10 | `audit_logs` | ثبت رویدادهای سیستم | ❌ | 001 |
| 11 | `roles` | نقش‌های سیستم (RBAC) | ✅ | 002 |
| 12 | `permissions` | دسترسی‌های سیستمی | ❌ | 002 |
| 13 | `role_permissions` | ارتباط نقش و دسترسی (Many-to-Many) | ❌ | 002 |
| 14 | `user_roles` | انتساب نقش به کاربران | ❌ | 002 |
| 15 | `addresses` | آدرس‌های کاربران (چندکشوری) | ✅ | 002 |
| 16 | `files` | مدیریت متمرکز فایل‌ها | ✅ | 002 |
| 17 | `notifications` | اعلان‌های کاربران | ✅ | 002 |
| 18 | `reviews` | سیستم امتیازدهی یکپارچه | ✅ | 002 |
| 19 | `coupons` | کدهای تخفیف (چندکشوری، چندارزی) | ✅ | 002 |
| 20 | `user_coupons` | استفاده کاربران از کدهای تخفیف | ❌ | 002 |
| **21** | **`devices`** | **اطلاعات دستگاه و FCM Token برای پوش‌نوتیفیکیشن** | **✅** | **003** |
| **22** | **`user_devices`** | **ارتباط Many-to-Many کاربران و دستگاه‌ها** | **❌** | **003** |
| **23** | **`sessions`** | **مدیریت نشست‌های فعال با Refresh Token** | **✅** | **003** |
| **24** | **`otp_codes`** | **کدهای یک‌بارمصرف (ورود/فراموشی رمز)** | **❌** | **003** |
| **25** | **`driver_earnings`** | **درآمدهای خرد راننده از هر سفر (چندارزی)** | **✅** | **003** |
| **26** | **`driver_settlements`** | **تسویه‌حساب‌های کلی با راننده (چندارزی)** | **✅** | **003** |
| **27** | **`tickets`** | **تیکت‌های پشتیبانی با شماره پیگیری یکتا** | **✅** | **003** |
| **28** | **`ticket_messages`** | **پیام‌های داخل هر تیکت (متن + پیوست)** | **❌** | **003** |

> **مجموع جداول: ۲۸ جدول** (۲۰ جدول از فاز اول و دوم + ۸ جدول جدید از فاز سوم)

---

## شاخص‌ها (Indexes) کلیدی

| جدول | ایندکس | نوع |
|------|--------|-----|
| users | `phone_number WHERE deleted_at IS NULL` | UNIQUE |
| users | `email WHERE email IS NOT NULL AND deleted_at IS NULL` | UNIQUE |
| drivers | `user_id WHERE deleted_at IS NULL` | UNIQUE |
| drivers | `phone_number WHERE deleted_at IS NULL` | UNIQUE |
| drivers | `operational_status WHERE operational_status = 'online'` | Partial |
| trips | `passenger_id, status` | Composite |
| trips | `driver_id, status` | Composite |
| wallets | `user_id, currency_id` | UNIQUE Composite |
| coupons | `code WHERE deleted_at IS NULL` | UNIQUE |
| addresses | `user_id WHERE is_default = TRUE` | Partial |
| notifications | `user_id WHERE is_read = FALSE` | Partial |
| reviews | `trip_id, reviewer_id, reviewee_id` | UNIQUE Composite |
| **devices** | **`device_id`** | **UNIQUE** |
| **devices** | **`fcm_token WHERE fcm_token IS NOT NULL`** | **Partial** |
| **sessions** | **`refresh_token`** | **UNIQUE** |
| **sessions** | **`user_id WHERE is_active = TRUE AND is_revoked = FALSE`** | **Partial** |
| **sessions** | **`expires_at WHERE is_revoked = FALSE`** | **Partial** |
| **otp_codes** | **`phone_number, type WHERE is_used = FALSE`** | **Partial** |
| **driver_earnings** | **`driver_id WHERE is_settled = FALSE AND deleted_at IS NULL`** | **Partial** |
| **driver_earnings** | **`driver_id, earning_type`** | **Composite** |
| **driver_earnings** | **`earned_at DESC`** | **B-Tree** |
| **driver_settlements** | **`status`** | **B-Tree** |
| **driver_settlements** | **`driver_id, period_start, period_end`** | **Composite** |
| **tickets** | **`tracking_code`** | **UNIQUE** |
| **tickets** | **`status WHERE status IN ('open','in_progress','waiting_on_customer')`** | **Partial** |
| **tickets** | **`related_entity_type, related_entity_id`** | **Composite** |
| **ticket_messages** | **`ticket_id, created_at`** | **Composite** |

---

## ENUM Types

| نام ENUM | مقادیر | Migration |
|----------|--------|-----------|
| `user_role` | passenger, driver, provider, admin, super_admin | 001 |
| `user_status` | active, inactive, suspended, banned | 001 |
| `driver_account_status` | pending_verification, verified, rejected, suspended, blocked | 001 |
| `driver_operational_status` | offline, online, busy, on_trip | 001 |
| `trip_status` | requested, driver_assigned, driver_arrived, passenger_boarded, in_progress, finished, cancelled, security_investigation, emergency_stop | 001 |
| `trip_payment_method` | wallet, cash, pay_later | 001 |
| `service_type` | urban_taxi, intercity_taxi, freight, delivery | 001 |
| `transaction_type` | CREDIT, DEBIT | 001 |
| `transaction_status` | pending, success, failed | 001 |
| `driver_document_type` | identity_card, driving_license, vehicle_card, operation_permit, selfie | 001 |
| `notification_type` | trip_update, promotion, system_alert, security_alert, payment_reminder, driver_message | 002 |
| `coupon_discount_type` | percentage, fixed_amount | 002 |
| `review_entity_type` | trip, driver, passenger | 002 |
| **_new_ `otp_type`** | **login, password_reset, phone_verification, email_verification** | **003** |
| **_new_ `earning_type`** | **trip_fare, bonus, tip, adjustment, penalty** | **003** |
| **_new_ `settlement_status`** | **pending, processing, completed, failed, cancelled** | **003** |
| **_new_ `ticket_priority`** | **low, medium, high, urgent, critical** | **003** |
| **_new_ `ticket_status`** | **open, in_progress, waiting_on_customer, waiting_on_third_party, resolved, closed, escalated** | **003** |
| **_new_ `ticket_department`** | **support, billing, technical, driver_affairs, cargo, tours, security** | **003** |

---

## ساختار RBAC (Role-Based Access Control)

### نقش‌های پیش‌فرض (5 نقش سیستمی):

| نقش | توضیح | سطح دسترسی |
|-----|--------|------------|
| `super_admin` | دسترسی کامل به تمام سیستم | تمام permissions |
| `admin` | مدیریت اداری سیستم | users, drivers, trips, wallets, config, coupons, reviews, support, finance |
| `support` | پشتیبانی مشتریان | مشاهده کاربران، رانندگان، سفرها + مدیریت تیکت‌ها |
| `driver` | ارائه‌دهنده خدمات | مشاهده و به‌روزرسانی سفرها، مشاهده کیف پول، ایجاد تیکت، مشاهده دریافتی‌ها و تسویه‌ها |
| `passenger` | کاربر نهایی | ایجاد/مشاهده/لغو سفر، مشاهده کیف پول، ثبت نظر، ایجاد/مشاهده تیکت |

### ۴۶ دسترسی (Permission) در ۱۰ ماژول:

| ماژول | دسترسی‌ها |
|-------|-----------|
| users | create, read, update, delete, assign_role |
| drivers | create, read, update, update_status |
| trips | create, read, update, cancel |
| wallets | read, charge, deduct |
| system | read, update (config) |
| coupons | create, read, update, delete |
| reviews | create, read |
| rbac | create, read, update, delete (roles) + assign (permissions) |
| **_new_ support** | **tickets.create, tickets.read, tickets.update, tickets.assign, tickets.close, tickets.escalate** |
| **_new_ finance** | **earnings.read, settlements.create, settlements.read, settlements.process, settlements.cancel** |

---

## دیتای پیش‌فرض (Seeds)

### ارزها (currencies):
| کد | نام | نماد | پیش‌فرض | نرخ |
|----|-----|------|---------|-----|
| IRT | Iranian Toman | IRR | ✅ | 1.0 |
| USD | US Dollar | $ | ❌ | 0.000024 |
| EUR | Euro | € | ❌ | 0.000022 |
| AFN | Afghan Afghani | ؋ | ❌ | 0.0018 |
| AED | UAE Dirham | د.إ | ❌ | 0.000088 |

### کشورها (countries):
| کد | نام | پیش‌شماره | ارز | منطقه زمانی |
|----|-----|-----------|-----|------------|
| IR | Iran | +98 | IRT | Asia/Tehran |
| AF | Afghanistan | +93 | AFN | Asia/Kabul |
| AE | UAE | +971 | AED | Asia/Dubai |

---

## معماری لاگین و احراز هویت (Authentication Flow)

سیستم احراز هویت شامل ۴ جدول است که به صورت یکپارچه کار می‌کنند:

1. **`devices`** - شناسایی دستگاه و نگهداری FCM Token
2. **`user_devices`** - اتصال کاربر به دستگاه‌هایش  
3. **`sessions`** - مدیریت نشست با Refresh Token Rotation
4. **`otp_codes`** - ارسال و تأیید کد یک‌بارمصرف

**جریان ورود کاربر:**
- کاربر شماره موبایل وارد می‌کند → OTP ارسال می‌شود → تأیید OTP → ایجاد Session با Refresh Token → دستگاه در `devices` ثبت می‌شود → ارتباط در `user_devices`

**امنیت:**
- OTP با هش ذخیره می‌شود (`code_hash`)
- هر OTP حداکثر ۵ بار تلاش دارد
- نشست‌ها قابلیت Revoke دارند
- Refresh Token یکتا است و فقط یک نشست فعال در هر زمان

---

## معماری مالی رانندگان (Driver Finance)

سیستم مالی رانندگان با پشتیبانی کامل از چندارزی طراحی شده است:

1. **`driver_earnings`** - هر سفر می‌تواند چندین درآمد داشته باشد:
   - کرایه سفر (`trip_fare`)
   - پاداش (`bonus`)
   - انعام (`tip`)
   - تعدیل (`adjustment`)
   - جریمه (`penalty`)

2. **`driver_settlements`** - تسویه‌حساب دوره‌ای:
   - پشتیبانی از شماره شبا/حساب بین‌المللی
   - ثبت SWIFT برای انتقالات خارجی
   - نگهداری مبلغ به ارز اصلی و ارز پیش‌فرض
   - کسر کارمزد و ثبت مبلغ خالص
   - ارجاع به کیف پول به جای پرداخت بانکی

---

## معماری پشتیبانی (Support System)

سیستم تیکت‌ینگ با قابلیت رهگیری کامل:

1. **`tickets`** - تیکت اصلی با:
   - شماره پیگیری یکتا (`TKT-XXXXXX`)
   - ۷ دپارتمان مختلف
   - ۵ سطح اولویت
   - ۷ وضعیت گردش کار
   - ارجاع به موجودیت‌های دیگر (سفر، راننده، پرداخت)

2. **`ticket_messages`** - پیام‌های داخل تیکت:
   - پشتیبانی از `message_type` (متن، یادداشت سیستمی، تغییر وضعیت)
   - پیوست‌های JSONB برای فایل‌ها
   - یادداشت‌های داخلی (`is_internal`) که برای مشتری نمایش داده نمی‌شود

---

## فایل‌های Migration

| فایل | مسیر | توضیح |
|------|------|--------|
| `001_initial_global_schema.sql` | `00-infrastructure/database/migrations/` | جداول پایه (۱۰ جدول) |
| `002_extended_global_schema.sql` | `00-infrastructure/database/migrations/` | توسعه RBAC + جداول عمومی (۱۰ جدول جدید) |
| `003_auth_finance_support_schema.sql` | `00-infrastructure/database/migrations/` | احراز هویت، مالی رانندگان و پشتیبانی (۸ جدول جدید) |

---

## خلاصه فازهای توسعه دیتابیس

| فاز | Migration | تعداد جداول | بخش‌ها |
|-----|-----------|-------------|--------|
| فاز اول | 001 | ۱۰ جدول | ارزها، کشورها، کاربران، رانندگان، سفرها، کیف پول، تراکنش‌ها، تنظیمات، لاگ |
| فاز دوم | 002 | ۱۰ جدول | RBAC، آدرس‌ها، فایل‌ها، نوتیفیکیشن، نظرات، کوپن‌ها |
| فاز سوم | 003 | ۸ جدول | دستگاه‌ها، نشست‌ها، OTP، درآمد رانندگان، تسویه‌حساب، تیکت‌ها، پیام‌ها |
| **نهایی** | **001 + 002 + 003** | **۲۸ جدول** | **معماری کامل دیتابیس سفر سرویس** |