const { QuoteNotFoundError } = require('../application/GetQuoteUseCase');
const {
    QuoteAlreadyConsumedError,
    QuoteExpiredError,
} = require('../domain/errors/PricingErrors');

class PricingController {
    constructor({ generateQuoteUseCase, getQuoteUseCase, consumeQuoteUseCase } = {}) {
        this.generateQuoteUseCase = generateQuoteUseCase;
        this.getQuoteUseCase = getQuoteUseCase;
        this.consumeQuoteUseCase = consumeQuoteUseCase;
    }

    async calculateQuote(req, res) {
        try {
            const { serviceType, distanceKm, durationMin, trafficMultiplier, referenceId } = req.body;

            // اعتبارسنجی اولیه ورودی‌ها
            if (!serviceType || distanceKm === undefined || durationMin === undefined) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'پارامترهای serviceType, distanceKm و durationMin الزامی هستند.' 
                });
            }

            const inputData = {
                serviceType,
                distanceKm: Number(distanceKm),
                durationMin: Number(durationMin),
                trafficMultiplier: trafficMultiplier ? Number(trafficMultiplier) : 1.0,
                referenceId: referenceId || null
            };

            // فراخوانی Use Case
            const result = await this.generateQuoteUseCase.execute(inputData);

            return res.status(201).json({
                success: true,
                message: 'پیش‌فاکتور با موفقیت ایجاد شد.',
                data: result
            });

        } catch (error) {
            console.error('[PricingController] Error calculating quote:', error);
            
            // مدیریت خطاهای شناخته شده (مانند پیدا نشدن کانفیگ)
            if (error.message && error.message.includes('هیچ کانفیگ فعالی')) {
                return res.status(404).json({ success: false, error: error.message });
            }

            return res.status(500).json({ 
                success: false, 
                error: 'خطای داخلی سرور در محاسبه قیمت.' 
            });
        }
    }

    async getQuote(req, res) {
        try {
            const { quoteId } = req.params;

            if (!quoteId) {
                return res.status(400).json({
                    success: false,
                    error: 'پارامتر quoteId الزامی است.'
                });
            }

            const result = await this.getQuoteUseCase.execute(quoteId);

            return res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('[PricingController] Error getting quote:', error);

            if (error instanceof QuoteNotFoundError || (error.code === 'QUOTE_NOT_FOUND')) {
                return res.status(404).json({ success: false, error: error.message });
            }

            return res.status(500).json({
                success: false,
                error: 'خطای داخلی سرور در دریافت پیش‌فاکتور.'
            });
        }
    }

    async consumeQuote(req, res) {
        try {
            const { quoteId } = req.params;
            const { referenceId } = req.body || {};

            if (!quoteId) {
                return res.status(400).json({
                    success: false,
                    error: 'پارامتر quoteId الزامی است.'
                });
            }

            const result = await this.consumeQuoteUseCase.execute(quoteId, referenceId);

            return res.status(200).json({
                success: true,
                message: 'پیش‌فاکتور با موفقیت مصرف شد.',
                data: result
            });
        } catch (error) {
            console.error('[PricingController] Error consuming quote:', error);

            if (error instanceof QuoteNotFoundError || error.code === 'QUOTE_NOT_FOUND') {
                return res.status(404).json({ success: false, error: error.message });
            }

            if (error instanceof QuoteAlreadyConsumedError || error.code === 'QUOTE_ALREADY_CONSUMED') {
                return res.status(409).json({ success: false, error: error.message });
            }

            if (error instanceof QuoteExpiredError || error.code === 'QUOTE_EXPIRED') {
                return res.status(400).json({ success: false, error: error.message });
            }

            if (error.code === 'QUOTE_ID_REQUIRED' || (error.statusCode === 400)) {
                return res.status(400).json({ success: false, error: error.message });
            }

            return res.status(500).json({
                success: false,
                error: 'خطای داخلی سرور در مصرف پیش‌فاکتور.'
            });
        }
    }
}

module.exports = PricingController;