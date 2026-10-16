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
- آخرین SHA تأییدشده هنگام ممیزی ۲۰۲۶-۱۰-۱۶: `f3c4d745e53f70fcc0f835180789ef9dfc929dc2`
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
- وضعیت جاری: ادغام‌شده در ۲۰۲۶-۱۰-۱۶؛ آخرین Commit شاخه اصلی `f3c4d745e53f70fcc0f835180789ef9dfc929dc2` است.
- آزمون از محاسبهٔ کرایه و ذخیرهٔ پیش‌فاکتور شروع می‌کند، آن را در تراکنش مصرف می‌کند و ثبت سفر، مبلغ و timeline را در PostgreSQL بررسی می‌کند. تلاش دوم برای استفاده از همان پیش‌فاکتور باید رد شود.
- اجرای نخست آزمون یکپارچه شکست خورد: ستون قدیمی `quotes.final_amount` به‌دلیل مهاجرت ۰۱۴ هنوز `NOT NULL` بود، اما مسیر جدید فقط `customer_final_amount` را پر می‌کرد. مهاجرت ۰۱۵ ستون‌های مدرن را اضافه کرده بود ولی قید قدیمی را حذف نکرده بود.
- اصلاح: هر دو مسیر ذخیرهٔ Quote اکنون `final_amount` را نیز ثبت می‌کنند؛ مهاجرت ۰۳۵ قیدهای اجباری ستون‌های صرفاً قدیمی در `pricing_audit_logs` را بدون حذف یا تغییر داده‌های تاریخی برمی‌دارد؛ ترتیب مهاجرت و آزمون یکپارچگی manifest هم به‌روزرسانی شده است.
- [اجرای اولیهٔ ناموفق و لاگ ریشه‌یابی](https://github.com/aliakbarhasani/safar-service/actions/runs/38907257105) علت را نشان داد؛ پس از اصلاح، [Backend CI روی main](https://github.com/aliakbarhasani/safar-service/actions/runs/38908387230) و [Trip Management CI روی main](https://github.com/aliakbarhasani/safar-service/actions/runs/38908387877) موفق شدند.
- Redis در این تست با نمونهٔ آزمایشی درون‌حافظه‌ای جایگزین شده است؛ بنابراین این آزمون مسیر application/database را پوشش می‌دهد، نه ارتباط واقعی Redis یا کل مسیر HTTP مرورگر تا Gateway.
- این وضعیت یک snapshot است؛ نتیجهٔ جاری را از GitHub بررسی کن.

## ماتریس وضعیت قابلیت‌ها

| حوزه | وضعیت ثبت‌شده | مدرک یا کار باقی‌مانده |
|---|---|---|
| قانون ضد دوباره‌کاری | ادغام‌شده | در همهٔ مراحل بعدی رعایت شود |
| اعتبارسنجی و نرمال‌سازی شماره تلفن | آزمون خودکار موفق | CI شاخه و پس از ادغام موفق |
| ورود OTP تا کوکی HttpOnly | آزمون یکپارچه در CI موفق | خروج، تمدید نشست و مسیرهای دیگر جداگانه ممیزی شوند |
| نمایش کرایه قبل از ثبت سفر | ادغام‌شده و Build/CI موفق | تست سرویس فرانت‌اند موفق؛ رزرو HTTP انتها‌به‌انتها هنوز لازم است |
| مصرف یک‌بارهٔ پیش‌فاکتور و ثبت سفر در PostgreSQL | آزمون یکپارچه در CI روی main موفق | [Backend CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38908387230)؛ مسیر HTTP کامل از مرورگر تا Gateway هنوز جداگانه تأیید نشده |
| چرخهٔ سفر تا پذیرش راننده و پایان | تأیید کامل نشده | ردیابی UI، Gateway، DB و dispatch |
| سایر ماژول‌ها | ممیزی نشده | بر اساس سند مادر، بدون حدس‌زدن وضعیت |

## گام بعدی با بالاترین اولویت
PR #86 ادغام شده و CI فعلی روی main برای ثبت پیش‌فاکتور تا سفر در PostgreSQL موفق است. گام بعدی، آزمون مسیر HTTP از Gateway تا ایجاد سفر و پاسخ UI با نشست آزمایشی است. در این نوبت همچنین پوشش CI برای آزمون‌های واحد migration runner افزوده می‌شود، چون فایل تست وجود داشت اما workflow فقط syntax آن را بررسی می‌کرد و خود آزمون واحد را اجرا نمی‌کرد. تا تأیید مسیر HTTP، کل چرخهٔ رزرو را کامل یا انتها‌به‌انتها اعلام نکن.

**قاعده نهایی:** پیشرفت یعنی نتیجهٔ قابل مشاهده و قابل راستی‌آزمایی، بدون شکستن رفتارهای سالم قبلی؛ تعداد فایل‌ها، Commitها یا PRها معیار پیشرفت نیست.


## ثبت اقدام جدید — ۲۰۲۶-۱۰-۱۶

- مبنای شاخه کاری: `f3c4d745e53f70fcc0f835180789ef9dfc929dc2` (آخرین `main` هنگام ممیزی).
- شاخه: `ci/run-migration-unit-tests-2026-10-16`.
- هدف: اجرای ۲۴ آزمون واحد موجودِ migration runner در Backend CI؛ پیش از تغییر، فایل آزمون وجود داشت اما workflow فقط `node --check` روی آزمون integration را اجرا می‌کرد و تست واحد `run-all-migrations.test.js` در CI فراخوانی نمی‌شد.
- فایل تغییرکرده: `.github/workflows/ci-test.yml`؛ یک گام مستقل با `NODE_ENV=test` و `npm test -- --runTestsByPath 00-infrastructure/database/migrations/__tests__/run-all-migrations.test.js` افزوده شد.
- معیار پذیرش: گام جدید در GitHub Actions روی همین commit موفق شود؛ در غیر این صورت ادغام نشود.
- نتیجهٔ واقعی آزمون روی Commit `a1478110045e894cad2291e3b2310dc9eefb0412`: گام `Run PostgreSQL migration runner unit tests` موفق شد؛ Backend CI نیز کامل موفق شد ([run 38909188141](https://github.com/aliakbarhasani/safar-service/actions/runs/38909188141)) و Trip Management CI موفق شد ([run 38909187880](https://github.com/aliakbarhasani/safar-service/actions/runs/38909187880)).
- این یادداشت بعد از نتیجهٔ بالا به‌روزرسانی می‌شود؛ چون Commit مستندات جدید ایجاد می‌کند، CI برای آخرین SHA دوباره اجرا خواهد شد و تا تکمیل آن ادغام انجام نمی‌شود.
