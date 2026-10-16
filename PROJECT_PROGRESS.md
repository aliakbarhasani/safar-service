# گزارش مرکزی پیشرفت پروژه — Safar Service

> این دفتر وضعیت و شواهد ثبت‌شده را نگه می‌دارد؛ پیش از هر اقدام، وضعیت جاری GitHub و CI را دوباره بررسی کن. هیچ وضعیت تاریخی را بدون راستی‌آزمایی جاری فرض نکن.

## قانون اجباری جلوگیری از دوباره‌کاری و عقب‌گرد
- پیش از هر تغییر، این دفتر، `AI_ENGINEER_PERMANENT_INSTRUCTIONS.md`، سند مادر، کد فعلی و PRهای مرتبط را بررسی کن.
- کار سالم و آزموده‌شده را بدون شاهد تازه از خرابی تکرار نکن.
- هر تغییر باید هدف مشخص، علت فنی، معیار پذیرش و آزمون مرتبط داشته باشد.
- Build موفق به‌تنهایی به معنی عملیاتی بودن قابلیت نیست؛ آزمون اجرا‌نشده را موفق ثبت نکن.
- تغییرات را در شاخه جداگانه انجام بده، CI را بررسی کن و پس از ادغام نیز CI شاخه اصلی را تأیید کن.
- پایان هر مرحله باید شامل فایل‌ها، Commit/PR، نتایج واقعی، موانع و مهم‌ترین گام بعدی باشد.

## وضعیت ثبت‌شده در ۲۰۲۶-۱۰-۱۶

### شاخه اصلی
- آخرین SHA تأییدشده هنگام تهیه این گزارش: `f3c4d745e53f70fcc0f835180789ef9dfc929dc2`
- [شاخه main](https://github.com/aliakbarhasani/safar-service/tree/main)

### کارهای ادغام‌شده و شواهد

**PR #82 — قانون دائمی و دفتر پیشرفت**
- [مشاهده PR #82](https://github.com/aliakbarhasani/safar-service/pull/82)
- وضعیت: ادغام‌شده؛ دستورالعمل دائمی و دفتر مرکزی در ریشه مخزن قرار گرفتند.

**PR #81 — اعتبارسنجی و نرمال‌سازی شماره تلفن**
- [مشاهده PR #81](https://github.com/aliakbarhasani/safar-service/pull/81)
- وضعیت: ادغام‌شده؛ اعتبارسنجی ورودی OTP، قالب یکسان ایران/افغانستان و جست‌وجوی حساب‌های قدیمی با قالب‌های قبلی.
- [Backend CI روی شاخه PR](https://github.com/aliakbarhasani/safar-service/actions/runs/38902994946) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38902994988) موفق شدند.
- [Backend CI پس از ادغام](https://github.com/aliakbarhasani/safar-service/actions/runs/38903204194) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38903204265) موفق شدند.

**PR #83 — آزمون یکپارچه ورود OTP و کوکی HttpOnly**
- [مشاهده PR #83](https://github.com/aliakbarhasani/safar-service/pull/83)
- وضعیت: ادغام‌شده؛ تست با قرارداد امنیتی کوکی HttpOnly هماهنگ شد و در CI اجرا می‌شود.
- [Backend CI روی شاخه PR](https://github.com/aliakbarhasani/safar-service/actions/runs/38903641917) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38903641837) موفق شدند.
- [Backend CI پس از ادغام](https://github.com/aliakbarhasani/safar-service/actions/runs/38903857153) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38903857183) موفق شدند.
- مسیر OTP تا نشست و کوکی HttpOnly در CI آزموده شده است؛ این به معنی کامل بودن کل سامانهٔ احراز هویت نیست.

**PR #84 — نمایش و تأیید کرایه قبل از ثبت سفر**
- [مشاهده PR #84](https://github.com/aliakbarhasani/safar-service/pull/84)
- وضعیت: ادغام‌شده؛ محاسبهٔ پیش‌فاکتور از ثبت سفر جدا شد، مبلغ پیش از ثبت نمایش داده می‌شود و تغییر مبدأ/مقصد پیش‌فاکتور قبلی را باطل می‌کند.
- [Backend CI روی شاخه PR](https://github.com/aliakbarhasani/safar-service/actions/runs/38904809305) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38904809285) موفق شدند.
- [Backend CI پس از ادغام](https://github.com/aliakbarhasani/safar-service/actions/runs/38905058472) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38905058347) موفق شدند.

**PR #85 — آزمون رگرسیون تأیید کرایه**
- [مشاهده PR #85](https://github.com/aliakbarhasani/safar-service/pull/85)
- وضعیت: ادغام‌شده؛ آزمون ثابت می‌کند پیش‌فاکتور به‌تنهایی سفر نمی‌سازد، ثبت سفر بدون `quoteId` به API نمی‌رسد و مبلغ کلاینت به‌عنوان مبلغ نهایی ارسال نمی‌شود.
- دو اجرای ابتدایی CI شکست خوردند: ابتدا به‌علت تنظیم نحوی اشتباه Jest و سپس به‌علت ناسازگاری ESM با Jest. هر دو علت اصلاح شدند؛ نسخهٔ نهایی آزمون موفق شد.
- [Backend CI روی شاخه PR](https://github.com/aliakbarhasani/safar-service/actions/runs/38906385482) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38906385472) موفق شدند.
- [Backend CI پس از ادغام](https://github.com/aliakbarhasani/safar-service/actions/runs/38906665820) و [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38906665865) موفق شدند.

### کار ادغام‌شده در آخرین بررسی

**PR #86 — آزمون یکپارچهٔ پیش‌فاکتور تا ثبت سفر در PostgreSQL**
- [مشاهده PR #86](https://github.com/aliakbarhasani/safar-service/pull/86)
- شاخه: `test/fare-quote-to-trip-integration`.
- وضعیت جاری: ادغام‌شده در ۲۰۲۶-۱۰-۱۶؛ آزمون یکپارچه روی PostgreSQL و CI پس از ادغام موفق شدند.
- آزمون از محاسبهٔ کرایه و ذخیرهٔ پیش‌فاکتور شروع می‌کند، آن را در تراکنش مصرف می‌کند و ثبت سفر، مبلغ و timeline را در PostgreSQL بررسی می‌کند. تلاش دوم برای استفاده از همان پیش‌فاکتور باید رد شود.
- اجرای نخست آزمون یکپارچه شکست خورد: ستون قدیمی `quotes.final_amount` به‌دلیل مهاجرت ۰۱۴ هنوز `NOT NULL` بود، اما مسیر جدید فقط `customer_final_amount` را پر می‌کرد. مهاجرت ۰۱۵ ستون‌های مدرن را اضافه کرده بود ولی قید قدیمی را حذف نکرده بود.
- اصلاح: هر دو مسیر ذخیرهٔ Quote اکنون `final_amount` را نیز ثبت می‌کنند؛ مهاجرت ۰۳۵ قیدهای اجباری ستون‌های صرفاً قدیمی در `pricing_audit_logs` را بدون حذف یا تغییر داده‌های تاریخی برمی‌دارد؛ ترتیب مهاجرت و آزمون یکپارچگی manifest هم به‌روزرسانی شده است.
- [اجرای اولیهٔ ناموفق و لاگ ریشه‌یابی](https://github.com/aliakbarhasani/safar-service/actions/runs/38907257105) علت را به‌صورت مستقیم نشان داد. آخرین Commit باید دوباره آزموده شود.
- Redis در این تست با نمونهٔ آزمایشی درون‌حافظه‌ای جایگزین شده است؛ بنابراین این آزمون مسیر application/database را پوشش می‌دهد، نه ارتباط واقعی Redis یا کل مسیر HTTP مرورگر تا Gateway.
- این وضعیت یک snapshot است؛ نتیجهٔ جاری را از GitHub بررسی کن.

## ماتریس وضعیت قابلیت‌ها

| حوزه | وضعیت ثبت‌شده | مدرک یا کار باقی‌مانده |
|---|---|---|
| قانون ضد دوباره‌کاری | ادغام‌شده | در همهٔ مراحل بعدی رعایت شود |
| اعتبارسنجی و نرمال‌سازی شماره تلفن | آزمون خودکار موفق | CI شاخه و پس از ادغام موفق |
| ورود OTP تا کوکی HttpOnly | آزمون یکپارچه در CI موفق | خروج، تمدید نشست و مسیرهای دیگر جداگانه ممیزی شوند |
| نمایش کرایه قبل از ثبت سفر | ادغام‌شده و Build/CI موفق | تست سرویس فرانت‌اند موفق؛ رزرو HTTP انتها‌به‌انتها هنوز لازم است |
| مصرف یک‌بارهٔ پیش‌فاکتور و ثبت سفر در PostgreSQL | آزمون یکپارچه و CI پس از ادغام موفق | Redis واقعی هنوز در این آزمون پوشش داده نشده |
| چرخهٔ سفر تا پذیرش راننده و پایان | تأیید کامل نشده | ردیابی UI، Gateway، DB و dispatch |
| سایر ماژول‌ها | ممیزی نشده | بر اساس سند مادر، بدون حدس‌زدن وضعیت |

## گام بعدی با بالاترین اولویت
PR #87 ادغام شده و آزمون HTTP احراز هویت‌شدهٔ ایجاد سفر و رد استفادهٔ دوباره از Quote در CI مربوط به Trip Management موفق است. Backend CI پس از آخرین ادغام باید تکمیل شود؛ سپس باقیماندهٔ مسیر Gateway و Redis واقعی بررسی شود. در این نوبت، شکاف CI مربوط به اجرا نشدن آزمون‌های واحد migration runner هم به‌صورت جداگانه اصلاح می‌شود. تا تأیید کل مسیر واقعی، چرخهٔ رزرو را کامل اعلام نکن.

**قاعده نهایی:** پیشرفت یعنی نتیجهٔ قابل مشاهده و قابل راستی‌آزمایی، بدون شکستن رفتارهای سالم قبلی؛ تعداد فایل‌ها، Commitها یا PRها معیار پیشرفت نیست.


## ثبت اقدام — ۲۰۲۶-۱۰-۱۶: افزودن آزمون واحد migration runner به CI

- مبنای جاری: `5727ce87fe7208884fdae2b5b59408e66ccd3450`; شاخه کاری: `ci/migration-runner-unit-tests-current-main-2026-10-16`.
- شاهد: `00-infrastructure/database/migrations/__tests__/run-all-migrations.test.js` شامل ۲۴ تست است، اما `.github/workflows/ci-test.yml` پیش از این فقط syntax آزمون integration را بررسی می‌کرد و فایل آزمون واحد را با Jest اجرا نمی‌کرد.
- تغییر محدود: یک گام `Run PostgreSQL migration runner unit tests` قبل از اجرای مهاجرت‌های PostgreSQL اضافه شد؛ هیچ منطق عملیاتی دیتابیس تغییر نکرد.
- معیار پذیرش: اجرای موفق گام جدید و هر دو CI روی SHA نهایی PR. این شاخه از آخرین main ساخته شده تا تغییرات هم‌زمان اخیر را حفظ کند.
- وضعیت فعلی: منتظر CI همین شاخه؛ ادغام خودکار انجام نمی‌شود.
