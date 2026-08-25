/**
 * QuoteResponseDto.test.js
 *
 * SECURITY TESTS for the DTO separation implemented at the Pricing API
 * boundary (stage 5 / 13):
 *
 *   Business rule: a customer must ONLY ever see the FINAL payable amount.
 *   All platform commission / tax / gross / provider / base-fare details are
 *   hidden from the customer and visible ONLY to the provider (and admin).
 *
 * These are unit tests (no DB) — they assert, explicitly, that the
 * customer-facing output NEVER contains the `tax` / `commission` keys (nor
 * gross / provider), and that the provider output DOES include them.
 */

const PricingController = require('../../presentation/PricingController');
const CustomerQuoteResponseDTO = require('../../presentation/dtos/CustomerQuoteResponseDTO');
const ProviderQuoteResponseDTO = require('../../presentation/dtos/ProviderQuoteResponseDTO');

// A full internal quote record containing BOTH canonical (camelCase) and
// DB-style (snake_case) keys — including every sensitive financial field.
const FULL_QUOTE = {
  quote_id: 'q-1',
  quoteId: 'q-1',
  status: 'CREATED',
  currency: 'IRT',
  currency_code: 'IRT',
  expires_at: '2026-01-01T00:00:00Z',
  expiresAt: '2026-01-01T00:00:00Z',
  customer_final_amount: '95000.0000',
  customerFinalAmount: '95000.0000',
  final_amount: '95000.0000',
  gross_amount: '95000.0000',
  grossAmount: '95000.0000',
  commission_amount: '9500.0000',
  commissionAmount: '9500.0000',
  tax_amount: '0.0000',
  taxAmount: '0.0000',
  provider_amount: '85500.0000',
  providerAmount: '85500.0000',
  distanceKm: 10,
  durationMin: 15,
  isExpired: false,
};

function captureRes() {
  const res = {
    statusCode: 0,
    jsonBody: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.jsonBody = payload; return this; },
  };
  return res;
}

describe('CustomerQuoteResponseDTO - strict data-hiding', () => {
  test('exposes ONLY customer-safe fields and never commission/tax/gross/provider/base', () => {
    const out = CustomerQuoteResponseDTO.fromQuote(FULL_QUOTE);

    expect(out.quote_id).toBe('q-1');
    expect(out.final_amount).toBe(95000);
    expect(out.currency).toBe('IRT');
    expect(out.status).toBe('CREATED');
    expect(out.expires_at).toBe('2026-01-01T00:00:00Z');
    expect(out.distance).toBe(10);
    expect(out.duration).toBe(15);

    // Explicit security assertions: sensitive keys must be ABSENT.
    expect('commission_amount' in out).toBe(false);
    expect('tax_amount' in out).toBe(false);
    expect('gross_amount' in out).toBe(false);
    expect('provider_amount' in out).toBe(false);
    expect(out.commission_amount).toBeUndefined();
    expect(out.tax_amount).toBeUndefined();
    expect(out.gross_amount).toBeUndefined();
    expect(out.provider_amount).toBeUndefined();
  });
});

describe('ProviderQuoteResponseDTO - transparent fee breakdown', () => {
  test('exposes gross/commission/tax/net-provider for the provider', () => {
    const out = ProviderQuoteResponseDTO.fromQuote(FULL_QUOTE);

    expect(out.quote_id).toBe('q-1');
    expect(out.gross_amount).toBe(95000);
    expect(out.commission_amount).toBe(9500);
    expect(out.tax_amount).toBe(0);
    expect(out.net_provider_amount).toBe(85500);
    expect(out.currency).toBe('IRT');
    expect(out.status).toBe('CREATED');
  });
});

describe('PricingController - role-based DTO at the API boundary', () => {
  const fakeGetQuoteUseCase = {
    async execute(quoteId) {
      return { ...FULL_QUOTE, quoteId: quoteId || 'q-1' };
    },
  };

  test('default (no role) renders the CUSTOMER DTO and hides fees', async () => {
    const controller = new PricingController({
      getQuoteUseCase: fakeGetQuoteUseCase,
      generateQuoteUseCase: null,
      consumeQuoteUseCase: null,
    });
    const res = captureRes();
    await controller.getQuote(
      { params: { quoteId: 'q-1' }, headers: {}, body: {}, query: {} },
      res,
    );

    const data = res.jsonBody.data;
    expect(data.quote_id).toBe('q-1');
    expect(data.final_amount).toBe(95000);
    expect(data.commission_amount).toBeUndefined();
    expect(data.tax_amount).toBeUndefined();
    expect(data.gross_amount).toBeUndefined();
    expect(data.provider_amount).toBeUndefined();
  });

  test('X-Caller-Role: provider renders the PROVIDER DTO with full fees', async () => {
    const controller = new PricingController({
      getQuoteUseCase: fakeGetQuoteUseCase,
      generateQuoteUseCase: null,
      consumeQuoteUseCase: null,
    });
    const res = captureRes();
    await controller.getQuote(
      { params: { quoteId: 'q-1' }, headers: { 'x-caller-role': 'provider' }, body: {}, query: {} },
      res,
    );

    const data = res.jsonBody.data;
    expect(data.quote_id).toBe('q-1');
    expect(data.gross_amount).toBe(95000);
    expect(data.commission_amount).toBe(9500);
    expect(data.tax_amount).toBe(0);
    expect(data.net_provider_amount).toBe(85500);
  });
});