/**
 * jest.config.js - محدود کردن الگوی کشف تست‌ها
 *
 * بدون این تنظیم، Jest با الگوی پیش‌فرض همه فایل‌های داخل پوشه‌های `__tests__`
 * را (حتی `runner.js` های legacy که به‌صورت مستقل اجرا می‌شوند و `process.exit`
 * صدا می‌زنند) به‌عنوان تست برمی‌دارد و همین باعث توقف زودرس کل سوئیت می‌شود.
 * با محدود کردن الگو فقط به `*.test.js` / `*.spec.js`، از اجرای ناخواسته فایل‌های
 * ساپورت/رنر جلوگیری می‌شود و Jest به‌صورت طبیعی پس از پایان تست‌ها خارج می‌شود.
 */

const config = {
  testMatch: ['**/?(*.)+(spec|test).[jt]s?(x)'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/client-web/src/$1',
  },
  // Archived modules are retained for reference only and are not compatible
  // with the active application module paths.
  testPathIgnorePatterns: ['/_legacy_archive/'],
};

module.exports = config;
