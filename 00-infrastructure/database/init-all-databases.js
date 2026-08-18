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
  console.log('🔧 شروع تهيئة پایگاه داده‌های تمام سرویس‌ها...\n');

  for (const service of services) {
    try {
      console.log(`⏳ در حال تهيئة ${service.name}...`);
      
      // dynamically require the init function
      const dbModule = require(service.initFile);
      
      // call the init function
      if (typeof dbModule[service.initFunction] === 'function') {
        await dbModule[service.initFunction]();
        console.log(`✅ ${service.name} با موفقیت تهيئه شد\n`);
      } else {
        console.warn(`⚠️  تابع ${service.initFunction} در ${service.name} یافت نشد\n`);
      }
    } catch (error) {
      console.error(`❌ خطا در تهيئة ${service.name}:`, error.message, '\n');
    }
  }

  console.log('✨ تهيئة پایگاه داده‌ها تکمیل شد');
}

module.exports = { initAllDatabases };
