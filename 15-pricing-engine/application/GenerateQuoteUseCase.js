const Quote = require('../domain/Quote');
const PricingCalculator = require('../domain/PricingCalculator');

class GenerateQuoteUseCase {
    constructor(pricingRepository) {
        this.pricingRepository = pricingRepository;
    }

    async execute(inputData) {
        // ۱. دریافت کانفیگ فعال
        const config = await this.pricingRepository.getActiveConfig(inputData.serviceType);

        // ۲. انجام محاسبات در لایه دامنه
        const calculationResult = PricingCalculator.calculateQuote(
            config, 
            inputData.distanceKm, 
            inputData.durationMin, 
            inputData.trafficMultiplier || 1.0
        );

        // ۳. ایجاد موجودیت Quote
        const quote = new Quote({
            pricingConfigId: config.id,
            serviceType: inputData.serviceType,
            referenceId: inputData.referenceId || null
        });

        quote.applyCalculationResult(calculationResult, inputData, config);

        // ۴. ذخیره در دیتابیس (تراکنش یکپارچه)
        const quoteId = await this.pricingRepository.saveQuoteAndAudit(quote);

        // ۵. بازگرداندن خروجی برای Controller
        // Internal superset: the presentation layer (DTO) decides which subset
        // is visible based on caller role (customer vs provider). The controller
        // strips tax/commission/provider from customer-facing responses.
        return {
            quoteId: quoteId,
            status: quote.status,
            customerFinalAmount: quote.amounts.customerFinal.toDatabaseFormat(),
            currency: quote.currencyCode,
            expiresAt: quote.expiresAt,
            grossAmount: quote.amounts.gross.toDatabaseFormat(),
            commissionAmount: quote.amounts.commission.toDatabaseFormat(),
            providerAmount: quote.amounts.provider.toDatabaseFormat(),
            taxAmount: quote.amounts.tax.toDatabaseFormat(),
            distanceKm: inputData.distanceKm,
            durationMin: inputData.durationMin
        };
    }
}

module.exports = GenerateQuoteUseCase;