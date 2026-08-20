const express = require('express');

/**
 * ایجاد روتر برای ماژول قیمت‌گذاری
 * @param {Object} pricingController - نمونه‌ای از کنترلر قیمت‌گذاری
 */
function createPricingRouter(pricingController) {
    const router = express.Router();

    // مسیر تولید پیش‌فاکتور و محاسبه قیمت
    // متد bind برای حفظ کانتکست this در کلاس کنترلر استفاده شده است
    router.post('/calculate', pricingController.calculateQuote.bind(pricingController));

    // مسیر دریافت یک پیش‌فاکتور بر اساس شناسه (همراه بررسی وضعیت انقضا)
    router.get('/quotes/:quoteId', pricingController.getQuote.bind(pricingController));

    // مسیر مصرف یک پیش‌فاکتور (با کنترل همزمانی و اعتبارسنجی وضعیت/انقضا)
    router.post('/quotes/:quoteId/consume', pricingController.consumeQuote.bind(pricingController));

    return router;
}

module.exports = createPricingRouter;