/**
 * init-all-databases.js
 * 
 * تهيئة تمام جداول پایگاه داده برای تمام سرویس‌ها
 * در هنگام شروع اپلیکیشن اجرا می‌شود
 */

const path = require('path');

// تمام سرویس‌هایی که نیاز به تهیئة قاعدة البيانات دارند
const services = [
  {
    name: 'Marketplace',
    initFile: path.join(__dirname, '../../09-marketplace/db/marketplace.db.js'),
    initFunction: 'initMarketplaceDB'
  },
  {
    name: 'Ads Service',
    initFile: path.join(__dirname, '../../10-ads-service/db/ads.db.js'),
    initFunction: 'initAdsDB'
  }
];

async function initAllDatabases() {
  const failures = [];
  console.log('🔧 شروع تهيئة پایگاه داده‌های تمام سرویس‌ها...\n');

  for (const service of services) {
    try {
      console.log(`⏳ در حال تهيئة ${service.name}...`);
      const dbModule = require(service.initFile);
      if (typeof dbModule[service.initFunction] === 'function') {
        await dbModule[service.initFunction]();
        console.log(`✅ ${service.name} با موفقیت تهيئه شد\n`);
      } else {
        throw new Error(`تابع ${service.initFunction} در ${service.name} یافت نشد`);
      }
    } catch (error) {
      failures.push({ service: service.name, message: error.message });
      console.error(`❌ خطا در تهيئة ${service.name}:`, error.message, '\n');
    }
  }

  if (failures.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Database initialization failed for: ${failures.map((item) => item.service).join(', ')}`);
  }

  console.log(failures.length
    ? `⚠️ تهيئة پایگاه داده‌ها با ${failures.length} خطا پایان یافت.`
    : '✨ تهيئة پایگاه داده‌ها تکمیل شد');
  return { success: failures.length === 0, failures };
}

module.exports = { initAllDatabases };
