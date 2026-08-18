/**
 * test-phase5-apis.js
 * 
 * اختبار شامل برای API Endpoints فاز ۵ (بازارچه و تبلیغات)
 * 
 * اجرا: node test-phase5-apis.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3000';

// رنگ‌های خروجی
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function makeRequest(method, path, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const jsonData = data ? JSON.parse(data) : {};
          resolve({ status: res.statusCode, data: jsonData, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: data, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  log(colors.blue, '\n═══════════════════════════════════════════════════════════');
  log(colors.blue, '🧪 اختبار API Endpoints فاز ۵ (بازارچه + تبلیغات)');
  log(colors.blue, '═══════════════════════════════════════════════════════════\n');

  let testsPassed = 0;
  let testsFailed = 0;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تست ۱: سلامت سرویس‌ها
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.yellow, '📝 تست ۱: سلامت سرویس‌ها');
  
  try {
    const res1 = await makeRequest('GET', '/api/v1/marketplace/health');
    if (res1.status === 200) {
      log(colors.green, '  ✅ Marketplace Health - OK');
      testsPassed++;
    } else {
      log(colors.red, `  ❌ Marketplace Health - ${res1.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ Marketplace Health - خطا: ${e.message}`);
    testsFailed++;
  }

  try {
    const res2 = await makeRequest('GET', '/api/v1/ads/health');
    if (res2.status === 200) {
      log(colors.green, '  ✅ Ads Health - OK');
      testsPassed++;
    } else {
      log(colors.red, `  ❌ Ads Health - ${res2.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ Ads Health - خطا: ${e.message}`);
    testsFailed++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تست ۲: دریافت محصولات (بدون احراز هویت)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.yellow, '\n📝 تست ۲: دریافت محصولات (عمومی)');
  
  try {
    const res = await makeRequest('GET', '/api/v1/marketplace/products');
    if (res.status === 200) {
      log(colors.green, `  ✅ GET /marketplace/products - ${res.status} OK`);
      log(colors.blue, `     تعداد محصولات: ${res.data.data?.products?.length || 0}`);
      testsPassed++;
    } else {
      log(colors.red, `  ❌ GET /marketplace/products - ${res.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ GET /marketplace/products - خطا: ${e.message}`);
    testsFailed++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تست ۳: محصول نامعتبر
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.yellow, '\n📝 تست ۳: محصول نامعتبر');
  
  try {
    const res = await makeRequest('GET', '/api/v1/marketplace/products/invalid-id');
    if (res.status === 404 || res.status === 200) {
      log(colors.green, `  ✅ GET /marketplace/products/:id - ${res.status}`);
      testsPassed++;
    } else {
      log(colors.red, `  ❌ GET /marketplace/products/:id - ${res.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ GET /marketplace/products/:id - خطا: ${e.message}`);
    testsFailed++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تست ۴: ایجاد محصول (بدون توکن - باید ۴۰۱)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.yellow, '\n📝 تست ۴: ایجاد محصول بدون احراز هویت');
  
  try {
    const res = await makeRequest('POST', '/api/v1/marketplace/products', {
      name: 'Test Product',
      price: 100,
    });
    if (res.status === 401) {
      log(colors.green, `  ✅ POST /marketplace/products (بدون توکن) - ${res.status} Unauthorized`);
      testsPassed++;
    } else {
      log(colors.red, `  ❌ POST /marketplace/products - انتظار ۴۰۱، دریافت ${res.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ POST /marketplace/products - خطا: ${e.message}`);
    testsFailed++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // تست ۵: دریافت کمپین‌ها (بدون توکن - باید ۴۰۱)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.yellow, '\n📝 تست ۵: دریافت کمپین‌ها بدون احراز هویت');
  
  try {
    const res = await makeRequest('GET', '/api/v1/ads/campaigns');
    if (res.status === 401) {
      log(colors.green, `  ✅ GET /ads/campaigns (بدون توکن) - ${res.status} Unauthorized`);
      testsPassed++;
    } else {
      log(colors.red, `  ❌ GET /ads/campaigns - انتظار ۴۰۱، دریافت ${res.status}`);
      testsFailed++;
    }
  } catch (e) {
    log(colors.red, `  ❌ GET /ads/campaigns - خطا: ${e.message}`);
    testsFailed++;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // خلاصة النتائج
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  
  log(colors.blue, '\n═══════════════════════════════════════════════════════════');
  log(colors.blue, '📊 خلاصة النتائج:');
  log(colors.blue, '═══════════════════════════════════════════════════════════');
  log(colors.green, `  ✅ اختبارات گذرفته شده: ${testsPassed}`);
  log(colors.red, `  ❌ اختبارات ناکام: ${testsFailed}`);
  log(colors.blue, `  📈 نسبة النجاح: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%\n`);

  process.exit(testsFailed > 0 ? 1 : 0);
}

// فعال کنید
runTests().catch(err => {
  log(colors.red, `خطای کلی: ${err.message}`);
  process.exit(1);
});
