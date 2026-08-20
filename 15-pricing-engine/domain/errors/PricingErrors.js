/**
 * PricingErrors - Domain Layer (Clean Architecture)
 *
 * Shared, typed domain errors used across the pricing engine so that
 * application use-cases and presentation controllers can distinguish
 * expected business-rule violations from unexpected failures.
 */

class QuoteNotFoundError extends Error {
    constructor(quoteId) {
        super(`هیچ پیش‌فاکتوری با شناسه ${quoteId} یافت نشد.`);
        this.name = 'QuoteNotFoundError';
        this.quoteId = quoteId;
        this.code = 'QUOTE_NOT_FOUND';
    }
}

class QuoteAlreadyConsumedError extends Error {
    constructor(quoteId) {
        super(`پیش‌فاکتور ${quoteId} قبلاً مصرف شده است.`);
        this.name = 'QuoteAlreadyConsumedError';
        this.quoteId = quoteId;
        this.code = 'QUOTE_ALREADY_CONSUMED';
        this.statusCode = 409;
    }
}

class QuoteExpiredError extends Error {
    constructor(quoteId) {
        super(`پیش‌فاکتور ${quoteId} منقضی شده است.`);
        this.name = 'QuoteExpiredError';
        this.quoteId = quoteId;
        this.code = 'QUOTE_EXPIRED';
        this.statusCode = 400;
    }
}

module.exports = {
    QuoteNotFoundError,
    QuoteAlreadyConsumedError,
    QuoteExpiredError,
};