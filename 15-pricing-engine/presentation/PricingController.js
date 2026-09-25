const { QuoteNotFoundError } = require('../application/GetQuoteUseCase');
const {
    QuoteAlreadyConsumedError,
    QuoteExpiredError,
} = require('../domain/errors/PricingErrors');
const CustomerQuoteResponseDTO = require('./dtos/CustomerQuoteResponseDTO');
const ProviderQuoteResponseDTO = require('./dtos/ProviderQuoteResponseDTO');

class PricingController {
    constructor({ generateQuoteUseCase, getQuoteUseCase, consumeQuoteUseCase } = {}) {
        this.generateQuoteUseCase = generateQuoteUseCase;
        this.getQuoteUseCase = getQuoteUseCase;
        this.consumeQuoteUseCase = consumeQuoteUseCase;
    }

    async calculateQuote(req, res) {
        try {
            const { serviceType, distanceKm, durationMin, referenceId } = req.body;

            // اعتبارسنجی اولیه ورودی‌ها
            if (!serviceType || distanceKm === undefined || durationMin === undefined) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'پارامترهای serviceType, distanceKm و durationMin الزامی هستند.' 
                });
            }

            // SECURITY: trafficMultiplier عمداً از body خوانده نمی‌شود تا مشتری
            // نتواند ضریب قیمت را دستکاری کند. غیاب آن → رفتار پیش‌فرض امن (1.0)
            // در GenerateQuoteUseCase/PricingCalculator اعمال می‌شود.
            const inputData = {
                serviceType,
                distanceKm: Number(distanceKm),
                durationMin: Number(durationMin),
                referenceId: referenceId || null
            };

            // فراخوانی Use Case
            const result = await this.generateQuoteUseCase.execute(inputData);

            // DTO separation at the API boundary: role-based visibility.
            // Default = customer (maximum data-hiding; no tax/commission exposed).
            const role = this._callerRole(req);
            const out = role === 'provider'
                ? ProviderQuoteResponseDTO.fromQuote(result)
                : CustomerQuoteResponseDTO.fromQuote(result);

            return res.status(201).json({
                success: true,
                message: 'پیش‌فاکتور با موفقیت ایجاد شد.',
                data: out
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

            // DTO separation at the API boundary: role-based visibility.
            const role = this._callerRole(req);
            const out = role === 'provider'
                ? ProviderQuoteResponseDTO.fromQuote(result)
                : CustomerQuoteResponseDTO.fromQuote(result);

            return res.status(200).json({
                success: true,
                data: out
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

    /**
     * Resolve the requesting caller's role at the API boundary.
     * SECURITY: Role MUST come exclusively from the authenticated JWT payload
     * (req.user). Reading role from headers (X-Caller-Role, X-Role), query params
     * (query.role) or body (body.role) is a Role Spoofing vulnerability and is
     * therefore forbidden. If no authenticated role exists, default to 'customer'
     * (maximum data-hiding).
     * @param {Object} req - Express request
     * @returns {'provider'|'customer'}
     */
    _callerRole(req) {
        const role = req.user && req.user.role ? String(req.user.role).toLowerCase() : 'customer';
        return role === 'provider' ? 'provider' : 'customer';
    }
}

module.exports = PricingController;