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
- آخرین SHA تأییدشده هنگام تهیه این گزارش: `4bf8c93c81aff709fdf94b0d7c65b031a8fb5d99`
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

### کار در حال بررسی

**PR #86 — آزمون یکپارچهٔ پیش‌فاکتور تا ثبت سفر در PostgreSQL**
- [مشاهده PR #86](https://github.com/aliakbarhasani/safar-service/pull/86)
- شاخه: `test/fare-quote-to-trip-integration`.
- وضعیت هنگام ثبت: باز؛ CI باید روی آخرین Commit بررسی شود.
- آزمون از محاسبهٔ کرایه و ذخیرهٔ پیش‌فاکتور شروع می‌کند، آن را در تراکنش مصرف می‌کند و ثبت سفر، مبلغ و timeline را در PostgreSQL بررسی می‌کند. تلاش دوم برای استفاده از همان پیش‌فاکتور باید رد شود.
- Redis در این تست با نمونهٔ آزمایشی درون‌حافظه‌ای جایگزین شده است؛ بنابراین این آزمون مسیر application/database را پوشش می‌دهد، نه ارتباط واقعی Redis یا کل مسیر HTTP مرورگر تا Gateway.
- این وضعیت یک snapshot است؛ نتیجهٔ جاری را از GitHub بررسی کن.

## ماتریس وضعیت قابلیت‌ها

| حوزه | وضعیت ثبت‌شده | مدرک یا کار باقی‌مانده |
|---|---|---|
| قانون ضد دوباره‌کاری | ادغام‌شده | در همهٔ مراحل بعدی رعایت شود |
| اعتبارسنجی و نرمال‌سازی شماره تلفن | آزمون خودکار موفق | CI شاخه و پس از ادغام موفق |
| ورود OTP تا کوکی HttpOnly | آزمون یکپارچه در CI موفق | خروج، تمدید نشست و مسیرهای دیگر جداگانه ممیزی شوند |
| نمایش کرایه قبل از ثبت سفر | ادغام‌شده و Build/CI موفق | تست سرویس فرانت‌اند موفق؛ رزرو HTTP انتها‌به‌انتها هنوز لازم است |
| مصرف یک‌بارهٔ پیش‌فاکتور و ثبت سفر در PostgreSQL | در PR #86 در حال آزمون | CI و نتیجهٔ آزمون یکپارچه باید موفق شوند |
| چرخهٔ سفر تا پذیرش راننده و پایان | تأیید کامل نشده | ردیابی UI، Gateway، DB و dispatch |
| سایر ماژول‌ها | ممیزی نشده | بر اساس سند مادر، بدون حدس‌زدن وضعیت |

## گام بعدی با بالاترین اولویت
ابتدا CI نهایی و بازبینی PR #86 را بررسی کن. اگر آزمونی شکست خورد، لاگ همان آزمون را بخوان، علت اصلی را اصلاح و دوباره اجرا کن؛ تا موفقیت همهٔ بررسی‌های لازم ادغام نکن. پس از ادغام، CI روی `main` را تأیید کن. سپس مسیر HTTP رزرو را از Gateway تا ایجاد سفر و پاسخ UI با نشست آزمایشی بررسی کن. تا آن زمان، کل چرخهٔ رزرو را کامل یا انتها‌به‌انتها تأییدشده اعلام نکن.

**قاعده نهایی:** پیشرفت یعنی نتیجهٔ قابل مشاهده و قابل راستی‌آزمایی، بدون شکستن رفتارهای سالم قبلی؛ تعداد فایل‌ها، Commitها یا PRها معیار پیشرفت نیست.
