/**
 * GetQuoteUseCase - Application Layer (Clean Architecture)
 *
 * Fetches a previously generated quote by id and reports its expiry state so
 * the client knows whether the price is still valid for consumption.
 */

class QuoteNotFoundError extends Error {
    constructor(quoteId) {
        super(`هیچ پیش‌فاکتوری با شناسه ${quoteId} یافت نشد.`);
        this.name = 'QuoteNotFoundError';
        this.quoteId = quoteId;
        this.code = 'QUOTE_NOT_FOUND';
    }
}

class GetQuoteUseCase {
    constructor(pricingRepository) {
        this.pricingRepository = pricingRepository;
    }

    async execute(quoteId) {
        // ۱. واکشی پیش‌فاکتور از دیتابیس
        const quote = await this.pricingRepository.getQuoteById(quoteId);

        // ۲. اگر یافت نشد -> خطای NotFound
        if (!quote) {
            throw new QuoteNotFoundError(quoteId);
        }

        // ۳. بررسی وضعیت انقضا با مقایسه expires_at و زمان فعلی سرور
        const now = new Date();
        const expiresAt = new Date(quote.expires_at);
        const isExpired = now > expiresAt;

        // ۴. بازگرداندن داده‌ی Quote به همراه وضعیت اعتبار
        return {
            quoteId: quote.id,
            serviceType: quote.service_type,
            currency: quote.currency_code,
            grossAmount: quote.gross_amount,
            discountAmount: quote.discount_amount,
            taxAmount: quote.tax_amount,
            commissionAmount: quote.commission_amount,
            providerAmount: quote.provider_amount,
            customerFinalAmount: quote.customer_final_amount,
            status: quote.status,
            inputSnapshot: quote.input_snapshot,
            calculationSnapshot: quote.calculation_snapshot,
            createdAt: quote.created_at,
            expiresAt: quote.expires_at,
            consumedAt: quote.consumed_at || null,
            cancelledAt: quote.cancelled_at || null,
            isExpired: isExpired,
        };
    }
}

module.exports = GetQuoteUseCase;
module.exports.QuoteNotFoundError = QuoteNotFoundError;