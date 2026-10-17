# گزارش مرکزی پیشرفت پروژه — Safar Service

> این دفتر، گزارش وضعیت و شواهد است. پیش از هر کار، شاخهٔ اصلی، کد، PRها و CI جاری را دوباره بررسی کن؛ وضعیت قدیمی را حقیقت فعلی فرض نکن.

## قانون اجباری جلوگیری از دوباره‌کاری و عقب‌گرد
- پیش از تغییر، این دفتر، `AI_ENGINEER_PERMANENT_INSTRUCTIONS.md`، سند مادر و کد موجود را بررسی کن.
- اصلاح سالم و آزموده‌شده را بدون شاهد تازه از خرابی تکرار نکن.
- هر تغییر باید هدف، علت، معیار پذیرش و آزمون مرتبط داشته باشد.
- Build سبز به‌تنهایی اثبات کارکرد نیست؛ آزمون اجرا‌نشده را موفق ثبت نکن.
- تغییرات را در شاخه جداگانه انجام بده؛ در شکست CI علت را بررسی کن و پس از ادغام نیز CI روی `main` را تأیید کن.
- در پایان هر مرحله، شواهد، فایل‌ها، PR/Commit، نتیجهٔ واقعی و گام بعدی را ثبت کن.

## وضعیت ثبت‌شده در ۲۰۲۶-۱۰-۱۷

### شاخه اصلی
- آخرین SHA تأییدشده هنگام تهیهٔ این گزارش: `d1991ff419526bd99ed8399892cae04065dd0835`
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
| پذیرش آفر راننده از وضعیت REQUESTED/SEARCHING | آزمون واحد و CI شاخه/پس از ادغام موفق در PR #94 | چرخهٔ واقعی تخصیص تا پایان سفر و اثر مالی هنوز E2E تأیید نشده |
| مالکیت عملیات رسیدن راننده | مسیر اصلی `ArriveAtPickupUseCase` از قبل مالکیت را داخل تراکنش بررسی می‌کرد؛ کد قدیمی نیز در PR #96 سخت‌سازی شد | آزمون کامل انتها‌به‌انتها همچنان لازم است |
| زمان شروع و رویدادهای رسیدن/شروع | PR #97؛ آزمون واحد و هر دو CI شاخه موفق | پس از ادغام، CI اصلی باید سبز بماند؛ سپس مسیر کامل E2E اجرا شود |
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

## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: اصلاح پذیرش سفر در وضعیت SEARCHING (PR #94)

- علت: مدل دامنه چرخهٔ `REQUESTED → SEARCHING → ACCEPTED` را پشتیبانی می‌کرد، اما `AcceptTripUseCase` فقط `REQUESTED → ACCEPTED` را می‌پذیرفت؛ در نتیجه سفر دارای آفر معتبر در وضعیت `SEARCHING` قابل پذیرش نبود.
- تغییر: ماشین حالت کانونی گذار `SEARCHING → ACCEPTED` را می‌شناسد؛ `AcceptTripUseCase` وضعیت جاری را می‌خواند و همان وضعیت را به‌عنوان `expectedState` به به‌روزرسانی اتمیک PostgreSQL می‌دهد. سازگاری با سفرهای قدیمی `REQUESTED` حفظ شده است.
- آزمون‌ها: گذارهای ماشین حالت، پذیرش از `REQUESTED` و `SEARCHING`، رد سفر پایانی/ناموجود و آزادسازی قفل در شکست. آزمون‌های موجود پذیرش و Outbox نیز در CI اجرا شدند.
- وضعیت: [PR #94](https://github.com/aliakbarhasani/safar-service/pull/94) ادغام شد؛ هر دو CI شاخه موفق شدند و هر دو CI پس از ادغام روی main نیز موفق شدند.
- شواهد پس از ادغام: [Backend CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38990181067)، [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/38990181070).
- محدودیت: این اصلاح پذیرش را در سطح ماشین حالت/UseCase آزموده است؛ مسیر واقعی از تخصیص راننده تا پذیرش، رسیدن، شروع، پایان و تسویه هنوز یک آزمون انتها‌به‌انتها واحد ندارد.

## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: سخت‌سازی کد قدیمی ثبت رسیدن راننده (PR #96)

- تغییر: `DriverArrivedUseCase` قدیمی اکنون شناسه راننده را با سفر قفل‌شده تطبیق می‌دهد؛ فقط راننده تخصیص‌یافته یا مدیر ارشد مجاز است.
- **تصحیح ممیزی:** بررسی مسیر واقعی در `02-api-gateway/api.routes.js` نشان داد Gateway از `ArriveAtPickupUseCase` استفاده می‌کند و این UseCase پیش از PR #96 نیز بررسی مالکیت داشت. بنابراین PR #96 را نباید رفع یک آسیب‌پذیری اثبات‌شده در مسیر اصلی معرفی کرد؛ این تغییر سخت‌سازی کد قدیمی و پوشش رگرسیون بود.
- وضعیت: PR #96 ادغام شد؛ هر دو CI شاخه موفق شدند. CI اصلی پس از ادغام PR #96 نیز موفق شد.
- شواهد: [PR #96](https://github.com/aliakbarhasani/safar-service/pull/96)، [Backend CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38990621511)، [Trip CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38990621593)، [Backend CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38990782157)، [Trip CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38990782120).

## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: ثبت پایدار رویدادهای چرخه و زمان شروع سفر (PR #97)

- علت: `StartTripUseCase` وضعیت `IN_PROGRESS` را ثبت می‌کرد، اما `TripRepository.updateTripStatus` مقدار `started_at` را ذخیره نمی‌کرد. همچنین خطای انتشار زندهٔ رویداد پس از `COMMIT` می‌توانست پاسخ شکست کاذب بدهد، هرچند وضعیت از قبل commit شده بود.
- تغییر: `started_at` در همان به‌روزرسانی وضعیت ذخیره می‌شود؛ رویدادهای `DriverArrived` و `TripStarted` داخل همان تراکنش به Outbox اضافه می‌شوند؛ انتشار زنده best-effort است و شکست ناشر دیگر نتیجهٔ commit‌شده را به شکست تبدیل نمی‌کند.
- آزمون‌ها: مالکیت راننده در مسیر اصلی رسیدن، ثبت Outbox در تراکنش، شکست ناشر پس از commit و ذخیرهٔ `started_at`.
- وضعیت: PR #97 ادغام شد؛ هر دو CI شاخه موفق شدند و CI پس از ادغام روی main نیز موفق شد.
- شواهد: [PR #97](https://github.com/aliakbarhasani/safar-service/pull/97)، [Backend CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38991071165)، [Trip CI شاخه](https://github.com/aliakbarhasani/safar-service/actions/runs/38991071198)، [Backend CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38991243324)، [Trip CI main](https://github.com/aliakbarhasani/safar-service/actions/runs/38991243290).

## وضعیت فعلی
- آخرین main تأییدشده هنگام ممیزی ۲۰۲۶-۱۰-۱۷: `e6aba0d600bf4b0d833b562a264a64ac396f478e`.
- Gateway واقعی از برآورد کرایه تا ایجاد سفر آزموده شده است.
- پذیرش آفر از وضعیت‌های `REQUESTED` و `SEARCHING` در آزمون‌های خودکار تأیید شده است.
- زمان شروع سفر اکنون ذخیره و رویدادهای رسیدن/شروع در Outbox ثبت می‌شوند.
- چرخهٔ کامل تخصیص راننده تا پایان سفر و اثر مالی هنوز به‌صورت یک مسیر واقعی واحد تأیید نشده است.
- **یافتهٔ باز:** مستندات کیف پول از بدهی در صورت کمبود موجودی حرف می‌زنند، اما مسیر فعلی `processTripPayment` در صورت کمبود موجودی پرداخت را متوقف می‌کند. باید این تفاوت با قرارداد مالی پروژه روشن و آزموده شود.
- گام بعدی: گسترش آزمون واقعی Gateway از ایجاد سفر به تخصیص راننده، پذیرش آفر، رسیدن، شروع، پایان و ثبت تراکنش‌های تسویه.
- پیش از تغییر بعدی، وضعیت فعلی را از مخزن و CI دوباره بررسی کن؛ هیچ آزمون اجرا‌نشده را موفق فرض نکن.


## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: تأیید چرخهٔ کامل سفر از Gateway واقعی (PR #99)

- شاخه: `test/gateway-trip-full-lifecycle-e2e`; PR: [#99](https://github.com/aliakbarhasani/safar-service/pull/99).
- آزمون رگرسیون اولیه به‌علت انتظار قدیمی در متن SQL شکست خورد؛ علت از لاگ واقعی شناسایی شد و assertion با cast واقعی `$2::varchar` هماهنگ شد.
- روی Commit کد `2626e22ea2a671167cf9518fb44447b932bf8ddf`، Backend CI و Trip Management CI هر دو موفق شدند. سپس دفتر پیشرفت به‌روزرسانی شد و CI روی Commit مستندسازی `62aca000d6b8a9b84c793669ce891452ddbc2497` نیز در هر دو workflow موفق شد: [Backend](https://github.com/aliakbarhasani/safar-service/actions/runs/39018546966)، [Trip](https://github.com/aliakbarhasani/safar-service/actions/runs/39018546959).
- وضعیت: PR #99 باز است و هنوز ادغام نشده. آزمون مسیر HTTP از برآورد کرایه تا پایان سفر، زمان شروع/پایان، کرایهٔ نهایی و رویداد Outbox را پوشش می‌دهد؛ **تسویهٔ واقعی کیف پول در این آزمون هنوز اثبات نشده است**.

## ثبت اقدام — ۲۰۲۶-۱۰-۱۷: اصلاح ناسازگاری بدهی کیف پول سفر (PR #100)

- مبنا: `e6aba0d600bf4b0d833b562a264a64ac396f478e`; شاخهٔ جداگانه: `fix/wallet-trip-settlement-debt-support`.
- علت اثبات‌شده: مهاجرت `030_wallet_debt_support.sql` منفی‌شدن ماندهٔ قابل استفاده و کل را برای ثبت بدهی مجاز می‌کند؛ مدل کیف پول نیز `debitAllowNegative` را برای همین رفتار دارد. اما `processTripPayment` هنوز `debitAvailableBalance` را فراخوانی می‌کرد و بدهی را همیشه `false` ثبت می‌کرد؛ در نتیجه پیاده‌سازی با قرارداد موجود پایگاه داده ناسازگار بود.
- تغییر محدود: استفاده از `debitAllowNegative`; تعیین بدهی از روی ماندهٔ پیش از کسر؛ ثبت تراکنش بدهکار مسافر با وضعیت `pending` هنگام کمبود موجودی؛ ثبت دفتر کل و اعتبار راننده/پلتفرم در همان تراکنش اتمیک. شکست در هر مرحله همچنان کل تسویه را rollback می‌کند.
- آزمون‌های رگرسیون: تسویهٔ موجودی کافی، بدهی و ماندهٔ منفی با تراکنش `pending`، ثبت دفتر کل، و رد کیف پولی که امکان کسر از آن وجود ندارد.
- وضعیت CI روی Commit `f252606751f7a93876298c7a5d86e83529766c43`: [Backend CI](https://github.com/aliakbarhasani/safar-service/actions/runs/39018808829) موفق؛ [Trip Management CI](https://github.com/aliakbarhasani/safar-service/actions/runs/39018808820) موفق.
- وضعیت PR: [#100](https://github.com/aliakbarhasani/safar-service/pull/100) باز است و ادغام نشده.
- گام بعدی: پس از بازبینی و مجوز ادغام PRها، CI روی `main` را بررسی کن و سپس آزمون Gateway را به تسویهٔ واقعی کیف پول با حساب‌های آزمایشی و بررسی سه تراکنش passenger/platform/driver گسترش بده. هیچ پرداخت واقعی اجرا نشود.

**یادآوری:** این دو PR از شاخه‌های جداگانه‌اند و هیچ تغییری مستقیم روی `main` انجام نشده. CI سبز روی شاخه، به‌معنای ادغام یا تأیید کل محصول نیست.
