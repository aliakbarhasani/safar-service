# گزارش مرکزی پیشرفت پروژه — Safar Service

> این دفتر، گزارش وضعیت و شواهد است. پیش از هر کار، شاخهٔ اصلی، کد، PRها و CI جاری را دوباره بررسی کن؛ وضعیت قدیمی را حقیقت فعلی فرض نکن.

## قانون اجباری جلوگیری از دوباره‌کاری و عقب‌گرد
- پیش از تغییر، این دفتر، `AI_ENGINEER_PERMANENT_INSTRUCTIONS.md`، سند مادر و کد موجود را بررسی کن.
- اصلاح سالم و آزموده‌شده را بدون شاهد تازه از خرابی تکرار نکن.
- هر تغییر باید هدف، علت، معیار پذیرش و آزمون مرتبط داشته باشد.
- Build سبز به‌تنهایی اثبات کارکرد نیست؛ آزمون اجرا‌نشده را موفق ثبت نکن.
- تغییرات را در شاخه جداگانه انجام بده؛ در شکست CI علت را بررسی کن و پس از ادغام نیز CI روی `main` را تأیید کن.
- در پایان هر مرحله، شواهد، فایل‌ها، PR/Commit، نتیجهٔ واقعی و گام بعدی را ثبت کن.

## وضعیت ثبت‌شده در ۲۰۲۶-۱۰-۱۶

### شاخه اصلی
- آخرین SHA تأییدشده هنگام تهیهٔ این گزارش: `0b82d47e9df600b88e50d5124cc7c68ed5e2f5aa`
- [شاخه main](https://github.com/aliakbarhasani/safar-service/tree/main)

### کارهای تکمیل‌شده و شواهد

**PR #82 — قانون دائمی و دفتر مرکزی پیشرفت**
- [PR #82](https://github.com/aliakbarhasani/safar-service/pull/82) ادغام‌شده؛ دستورالعمل ضد دوباره‌کاری و `PROJECT_PROGRESS.md` در ریشه مخزن ثبت شدند.

**PR #81 — اعتبارسنجی و نرمال‌سازی شماره تلفن**
- [PR #81](https://github.com/aliakbarhasani/safar-service/pull/81) ادغام‌شده.
- اعتبارسنجی OTP، قالب یکسان ایران/افغانستان، محدودسازی درخواست بر اساس شماره استانداردشده و جست‌وجوی حساب‌های قدیمی با قالب‌های قبلی.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38902994946)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38902994988)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38903204194)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38903204265).

**PR #83 — آزمون یکپارچه ورود OTP و کوکی HttpOnly**
- [PR #83](https://github.com/aliakbarhasani/safar-service/pull/83) ادغام‌شده؛ تست قدیمی با قرارداد امن کوکی HttpOnly هماهنگ شد و در CI اجرا می‌شود.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38903641917)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38903641837)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38903857153)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38903857183).

**PR #84 — نمایش و تأیید کرایه قبل از ثبت سفر**
- [PR #84](https://github.com/aliakbarhasani/safar-service/pull/84) ادغام‌شده؛ محاسبهٔ پیش‌فاکتور از ثبت سفر جدا شد، مبلغ قبل از ثبت نمایش داده می‌شود و تغییر مبدأ/مقصد پیش‌فاکتور را باطل می‌کند.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38904809305)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38904809285)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38905058472)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38905058347).

**PR #85 — آزمون رگرسیون پیش‌فاکتور**
- [PR #85](https://github.com/aliakbarhasani/safar-service/pull/85) ادغام‌شده؛ تست ثابت می‌کند پیش‌فاکتور به‌تنهایی سفر نمی‌سازد و ثبت سفر بدون Quote معتبر به API نمی‌رسد.
- دو اجرای اولیه به‌علت تنظیم Jest و ناسازگاری ESM شکست خوردند؛ علت‌ها اصلاح و اجرای نهایی موفق شد.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38906385482)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38906385472)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38906665820)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38906665865).

**PR #86 — آزمون یکپارچهٔ Quote تا ثبت سفر در PostgreSQL**
- [PR #86](https://github.com/aliakbarhasani/safar-service/pull/86) ادغام‌شده.
- آزمون یکپارچه خطای واقعی schema را پیدا کرد: ستون قدیمی `quotes.final_amount` اجباری بود ولی مسیر جدید آن را پر نمی‌کرد. هر دو مسیر ذخیرهٔ Quote اصلاح شدند؛ مهاجرت ۰۳۵ قیدهای اجباری ستون‌های صرفاً قدیمی `pricing_audit_logs` را بدون حذف دادهٔ تاریخی برداشت.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38908138832)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38908139147)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38908387230)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38908387877).

**PR #87 — آزمون HTTP ایجاد سفر با نشست و مجوز**
- [PR #87](https://github.com/aliakbarhasani/safar-service/pull/87) ادغام‌شده.
- با middleware واقعی احراز هویت، مجوز مسافر و `TripRouter` آزموده شد: درخواست ناشناس 401 می‌گیرد، نشست معتبر یک سفر ایجاد می‌کند و بازپخش همان Quote با 409 رد می‌شود.
- CI شاخه و پس از ادغام موفق: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/38909094942)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/38909094732)، [Backend main](https://github.com/aliakbarhasani/safar-service/actions/runs/38909422725)، [Trip main](https://github.com/aliakbarhasani/safar-service/actions/runs/38909422691).

### کار در حال بررسی

**PR #90 — آزمون ایجاد سفر با Redis واقعی**
- [PR #90](https://github.com/aliakbarhasani/safar-service/pull/90)
- شاخه: `test/trip-http-real-redis`
- وضعیت جاری: ادغام‌شده در ۲۰۲۶-۱۰-۱۶؛ Backend CI و Trip Management CI روی main موفق شدند.
- Redis آزمایشی به `docker-compose.test.yml` افزوده شده و آزمون HTTP از `ioredis` و `FareQuoteStore` واقعی استفاده می‌کند؛ PostgreSQL، نشست و middlewareهای واقعی نیز استفاده می‌شوند.
- این آزمون هنوز کل API Gateway را با همهٔ سرویس‌های جانبی بالا نمی‌آورد؛ آن بخش همچنان نیازمند بررسی جداگانه است.

## ماتریس وضعیت قابلیت‌ها

| حوزه | وضعیت ثبت‌شده | مدرک یا کار باقی‌مانده |
|---|---|---|
| قانون ضد دوباره‌کاری | ادغام‌شده | در تمام مراحل رعایت شود |
| OTP تا نشست و کوکی HttpOnly | آزمون یکپارچه در CI موفق | تمدید نشست و خروج جداگانه ممیزی شوند |
| پیش‌فاکتور تا ثبت سفر در PostgreSQL | آزمون یکپارچه و CI پس از ادغام موفق | آزمون HTTP با Redis واقعی نیز پس از ادغام CI موفق داشت |
| HTTP ایجاد سفر با احراز هویت و مجوز | آزمون یکپارچه و CI پس از ادغام موفق | Gateway کامل با تمام سرویس‌ها هنوز جداگانه تأیید نشده |
| مسیر واقعی Gateway از برآورد کرایه تا ایجاد سفر | آزمون انتها‌به‌انتها و CI پس از ادغام موفق در PR #92 | پذیرش راننده، شروع/پایان سفر و تسویه هنوز در یک مسیر واقعی واحد آزموده نشده |
| چرخهٔ کامل تا پذیرش راننده و پایان سفر | تأیید کامل نشده | ردیابی dispatch، پذیرش پیشنهاد، رسیدن، شروع، پایان و اثر مالی |
| سایر ماژول‌ها | ممیزی نشده | طبق سند مادر، بدون حدس‌زدن وضعیت |

## گام بعدی با بالاترین اولویت
PR #92 مسیر واقعی Gateway را از برآورد کرایه تا ایجاد سفر با PostgreSQL و Redis آزمایش کرد. گام بعدی، آزمون انتها‌به‌انتها و مبتنی بر سرویس واقعی برای تخصیص سفر به راننده، پذیرش پیشنهاد، رسیدن به مبدأ، شروع و پایان سفر و پیامدهای مالی است. تا تأیید این چرخه، کل رزرو یا کل محصول را کامل اعلام نکن.

**قاعده نهایی:** پیشرفت یعنی نتیجهٔ قابل مشاهده و قابل راستی‌آزمایی بدون شکستن رفتارهای سالم قبلی؛ تعداد فایل‌ها، Commitها و PRها معیار پیشرفت نیست.


## ثبت اقدام — ۲۰۲۶-۱۰-۱۶: پوشش آزمون واحد migration runner در CI (PR #91)

- مبنای تغییر: `5fe7d726635e5cd5db0171ee4b4c762265d70012`; شاخه کاری: `ci/migration-unit-tests-after-redis-2026-10-16`.
- شاهد: فایل `00-infrastructure/database/migrations/__tests__/run-all-migrations.test.js` دارای ۲۴ آزمون بود، اما workflow جاری آن را با Jest اجرا نمی‌کرد.
- تغییر محدود: اجرای آزمون‌های واحد قبل از مهاجرت PostgreSQL؛ منطق runtime و schema تغییر نکرد.
- وضعیت: PR #91 ادغام شد؛ ۲۴ آزمون واحد و هر دو workflow روی main موفق شدند.
- شواهد: [PR #91](https://github.com/aliakbarhasani/safar-service/pull/91)، [Backend CI روی شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38910862617)، [Trip CI روی شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38910862622)، [Backend CI روی main](https://github.com/aliakbarhasani/safar-service/actions/runs/38963391336)، [Trip CI روی main](https://github.com/aliakbarhasani/safar-service/actions/runs/38963391164).

## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: آزمون انتها‌به‌انتهای Gateway واقعی (PR #92)

- مبنای main پس از ادغام: `0b82d47e9df600b88e50d5124cc7c68ed5e2f5aa`.
- علت: آزمون قبلی TripRouter و middlewareهای واقعی را با Express آزمایشی بررسی می‌کرد، اما خود `01-core-system/server.js` و Gateway واقعی را بالا نمی‌آورد.
- تغییر: آزمون جدید یک پردازهٔ واقعی Gateway را اجرا می‌کند، از `GET /api/v1/trip/estimate` پیش‌فاکتور می‌گیرد، درخواست ناشناس را با 401 رد می‌کند، با نشست و کوکی HttpOnly سفر می‌سازد و بازپخش همان Quote را با 409 رد می‌کند.
- وابستگی‌های آزمون: PostgreSQL و Redis واقعیِ مخصوص CI؛ `REQUIRE_TEST_DATABASE=true` مانع سبز شدن کاذب با skip می‌شود.
- وضعیت: PR #92 ادغام شد؛ آزمون Gateway در CI شاخه و پس از ادغام موفق بود؛ هر دو workflow اصلی روی main پس از ادغام سبز شدند.
- شواهد: [PR #92](https://github.com/aliakbarhasani/safar-service/pull/92)، [Backend CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38989255676)، [Trip CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38989255479)، [Backend CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38989420405)، [Trip CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38989420400).

## وضعیت فعلی
- آخرین main: `0b82d47e9df600b88e50d5124cc7c68ed5e2f5aa`.
- Gateway واقعی از برآورد کرایه تا ایجاد سفر آزموده شده است.
- چرخهٔ تخصیص/پذیرش راننده تا پایان سفر و تسویه هنوز به‌صورت یک مسیر کامل تأیید نشده است.
- پیش از تغییر بعدی، وضعیت فعلی را از مخزن و CI دوباره بررسی کن؛ هیچ آزمون اجرا‌نشده را موفق فرض نکن.
