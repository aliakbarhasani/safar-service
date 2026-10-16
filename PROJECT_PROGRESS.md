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
- آخرین SHA تأییدشده هنگام تهیهٔ این گزارش: `5727ce87fe7208884fdae2b5b59408e66ccd3450`
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
- وضعیت هنگام ثبت: باز؛ CI روی آخرین Commit باید بررسی شود.
- Redis آزمایشی به `docker-compose.test.yml` افزوده شده و آزمون HTTP از `ioredis` و `FareQuoteStore` واقعی استفاده می‌کند؛ PostgreSQL، نشست و middlewareهای واقعی نیز استفاده می‌شوند.
- این آزمون هنوز کل API Gateway را با همهٔ سرویس‌های جانبی بالا نمی‌آورد؛ آن بخش همچنان نیازمند بررسی جداگانه است.

## ماتریس وضعیت قابلیت‌ها

| حوزه | وضعیت ثبت‌شده | مدرک یا کار باقی‌مانده |
|---|---|---|
| قانون ضد دوباره‌کاری | ادغام‌شده | در تمام مراحل رعایت شود |
| OTP تا نشست و کوکی HttpOnly | آزمون یکپارچه در CI موفق | تمدید نشست و خروج جداگانه ممیزی شوند |
| پیش‌فاکتور تا ثبت سفر در PostgreSQL | آزمون یکپارچه و CI پس از ادغام موفق | Redis واقعی در PR #90 در حال آزمون |
| HTTP ایجاد سفر با احراز هویت و مجوز | آزمون یکپارچه و CI پس از ادغام موفق | آزمون PR #90 باید Redis واقعی را تأیید کند |
| کل API Gateway تا Redis واقعی | هنوز تأیید نشده | مرحلهٔ بعد از PR #90 |
| چرخهٔ کامل تا پذیرش راننده و پایان سفر | تأیید کامل نشده | ردیابی dispatch و وضعیت‌های سفر |
| سایر ماژول‌ها | ممیزی نشده | طبق سند مادر، بدون حدس‌زدن وضعیت |

## گام بعدی با بالاترین اولویت
ابتدا CI و بازبینی PR #90 را بررسی کن. در صورت شکست، لاگ را بخوان و علت را اصلاح کن؛ تا موفقیت همهٔ بررسی‌ها ادغام نکن. پس از ادغام، CI روی `main` را تأیید کن. سپس مسیر واقعی API Gateway را با Redis و PostgreSQL آزمایشی بررسی کن. تا آن زمان، کل رزرو یا کل محصول را انتها‌به‌انتها تأییدشده اعلام نکن.

**قاعده نهایی:** پیشرفت یعنی نتیجهٔ قابل مشاهده و قابل راستی‌آزمایی بدون شکستن رفتارهای سالم قبلی؛ تعداد فایل‌ها، Commitها و PRها معیار پیشرفت نیست.


## ثبت اقدام — ۲۰۲۶-۱۰-۱۶: پوشش آزمون واحد migration runner در CI

- مبنای شاخه: `5fe7d726635e5cd5db0171ee4b4c762265d70012`; شاخه کاری: `ci/migration-unit-tests-after-redis-2026-10-16`.
- شاهد: فایل `00-infrastructure/database/migrations/__tests__/run-all-migrations.test.js` دارای ۲۴ آزمون است، اما workflow جاری `.github/workflows/ci-test.yml` آن را با Jest اجرا نمی‌کرد؛ فقط آزمون integration از نظر syntax بررسی می‌شد.
- تغییر محدود: اجرای فایل آزمون واحد با Jest قبل از اجرای مهاجرت‌های PostgreSQL. منطق runtime، schema و داده‌های عملیاتی تغییر نکردند.
- این شکاف قبلاً روی شاخهٔ آزمایشی جداگانه اثبات شد: ۲۴/۲۴ تست موفق در CI روی Commit `83f9602a6f48163eb5c758aa8928289ba3fe9ed3`. این شاخهٔ تازه از main جدیدتر ساخته شده تا تغییرات PR #90 درباره Redis واقعی حفظ شود.
- معیار پذیرش: ۲۴ تست موفق و هر دو گردش‌کار CI روی آخرین SHA این PR. تا تکمیل بررسی، ادغام انجام نمی‌شود.
