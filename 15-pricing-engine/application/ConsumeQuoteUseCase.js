/**
 * ConsumeQuoteUseCase - Application Layer (Clean Architecture)
 *
 * Consumes (uses) a previously generated quote for a concrete trip/order.
 * Delegates the transactional, race-condition-safe persistence and
 * validation (status + expiry) to the repository.
 */

class ConsumeQuoteUseCase {
    constructor(pricingRepository) {
        this.pricingRepository = pricingRepository;
    }

    async execute(quoteId, referenceId) {
        if (!quoteId) {
            const error = new Error('پارامتر quoteId الزامی است.');
            error.code = 'QUOTE_ID_REQUIRED';
            error.statusCode = 400;
            throw error;
        }

        const consumedQuote = await this.pricingRepository.consumeQuote(quoteId, referenceId || null);

        return {
            quoteId: consumedQuote.id,
            status: consumedQuote.status,
            referenceId: consumedQuote.reference_id,
            consumedAt: consumedQuote.consumed_at,
        };
    }
}

module.exports = ConsumeQuoteUseCase;