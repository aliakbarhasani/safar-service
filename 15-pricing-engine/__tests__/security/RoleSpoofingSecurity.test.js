/**
 * Security Tests - Role Spoofing Prevention (PricingController)
 *
 * A caller's role may ONLY be derived from the authenticated JWT payload
 * (`req.user`). Every client-controllable source (headers, query string, body)
 * must be ignored, otherwise an attacker could read the platform commission /
 * provider payout breakdown of a quote.
 *
 * Converted from a standalone `console.log` + `process.exit()` script into a
 * real Jest suite so it reports results without killing the Jest worker.
 */

const PricingController = require('../../presentation/PricingController');
const CustomerQuoteResponseDTO = require('../../presentation/dtos/CustomerQuoteResponseDTO');
const ProviderQuoteResponseDTO = require('../../presentation/dtos/ProviderQuoteResponseDTO');

const controller = new PricingController();

/** Internal (superset) quote payload produced by GenerateQuoteUseCase. */
const INTERNAL_QUOTE = {
  quoteId: 'quote-1',
  status: 'CREATED',
  customerFinalAmount: '95000',
  grossAmount: '95000',
  commissionAmount: '9500',
  providerAmount: '85500',
  taxAmount: '0',
  currency: 'IRT',
  expiresAt: '2030-01-01T00:00:00.000Z',
};

describe('RoleSpoofingSecurity - _callerRole resolution', () => {
  test('req.user.role=provider is respected even when every client input says customer', () => {
    const req = {
      user: { role: 'provider' },
      headers: { 'x-caller-role': 'customer', 'x-role': 'customer' },
      query: { role: 'customer' },
      body: { role: 'customer' },
    };

    expect(controller._callerRole(req)).toBe('provider');
  });

  test('req.user.role=customer is respected even when every client input says provider', () => {
    const req = {
      user: { role: 'customer' },
      headers: { 'x-caller-role': 'provider', 'x-role': 'provider' },
      query: { role: 'provider' },
      body: { role: 'provider' },
    };

    expect(controller._callerRole(req)).toBe('customer');
  });

  test('the X-Caller-Role header is ignored', () => {
    const req = { headers: { 'x-caller-role': 'provider' }, query: {}, body: {} };
    expect(controller._callerRole(req)).toBe('customer');
  });

  test('the X-Role header is ignored', () => {
    const req = { headers: { 'x-role': 'provider' }, query: {}, body: {} };
    expect(controller._callerRole(req)).toBe('customer');
  });

  test('the query string role is ignored', () => {
    const req = { headers: {}, query: { role: 'provider' }, body: {} };
    expect(controller._callerRole(req)).toBe('customer');
  });

  test('the body role is ignored', () => {
    const req = { headers: {}, query: {}, body: { role: 'provider' } };
    expect(controller._callerRole(req)).toBe('customer');
  });

  test('an unauthenticated request defaults to customer', () => {
    expect(controller._callerRole({ headers: {}, query: {}, body: {} })).toBe('customer');
  });

  test('an unknown/privileged role (admin) still maps to the data-hiding customer view', () => {
    const req = { user: { role: 'admin' }, headers: {}, query: {}, body: {} };
    expect(controller._callerRole(req)).toBe('customer');
  });

  test('role matching is case tolerant, but a missing user is never elevated', () => {
    expect(controller._callerRole({ user: { role: 'PROVIDER' }, headers: {}, query: {}, body: {} })).toBe('provider');
    expect(controller._callerRole({ user: { role: 'Provider' }, headers: {}, query: {}, body: {} })).toBe('provider');
    expect(controller._callerRole({ user: {}, headers: {}, query: {}, body: {} })).toBe('customer');
    expect(controller._callerRole({ user: null, headers: {}, query: { role: 'provider' }, body: {} })).toBe('customer');
  });
});

describe('RoleSpoofingSecurity - DTO output boundaries', () => {
  test('the customer DTO never carries the fee breakdown', () => {
    const out = CustomerQuoteResponseDTO.fromQuote(INTERNAL_QUOTE);

    expect(out.quote_id).toBe('quote-1');
    expect(out.final_amount).toBe(95000);
    expect(out.currency).toBe('IRT');

    const forbidden = [
      'gross_amount', 'commission_amount', 'tax_amount',
      'provider_amount', 'net_provider_amount',
      'calculation_snapshot', 'rule_snapshot', 'input_snapshot',
    ];
    forbidden.forEach((key) => expect(out[key]).toBeUndefined());
  });

  test('the provider DTO exposes the transparent breakdown but not the customer-only field', () => {
    const out = ProviderQuoteResponseDTO.fromQuote(INTERNAL_QUOTE);

    expect(out.gross_amount).toBe(95000);
    expect(out.commission_amount).toBe(9500);
    expect(out.tax_amount).toBe(0);
    expect(out.net_provider_amount).toBe(85500);
    expect(out.final_amount).toBeUndefined();
  });

  test('both DTOs are null-safe on an empty payload', () => {
    expect(CustomerQuoteResponseDTO.fromQuote()).toMatchObject({ quote_id: null, final_amount: null });
    expect(ProviderQuoteResponseDTO.fromQuote()).toMatchObject({ quote_id: null, gross_amount: null });
  });
});
