/**
 * CustomerQuoteResponseDTO - Secure Customer-Facing Quote DTO.
 *
 * BUSINESS RULE (confidentiality):
 *   A CUSTOMER must only ever see the FINAL payable amount. All platform
 *   commission, tax, gross, provider and base-fare details are STRICTLY
 *   EXCLUDED from this representation.
 *
 *   When a caller's role is unknown, this DTO is the default shape used at
 *   the API boundary (maximum data-hiding / zero-information-leak policy).
 *
 * This DTO is an allow-list formatter: only the explicitly-listed fields can
 * ever appear in the output, so sensitive keys can never leak unintentionally.
 */

function toFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeParse(input) {
  if (!input) return {};
  try {
    const parsed = typeof input === 'string' ? JSON.parse(input) : input;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    return {};
  }
}

class CustomerQuoteResponseDTO {
  /**
   * Build a customer-safe quote payload from internal quote data.
   * @param {Object} d - internal/DB quote record or use-case result
   * @returns {{quote_id:*, final_amount:*, currency:*, status:*, expires_at:*, distance:*, duration:*}}
   */
  static fromQuote(d = {}) {
    const inputSnapshot = safeParse(d.input_snapshot);

    return {
      quote_id: d.quoteId ?? d.quote_id ?? null,
      final_amount: toFinite(d.customerFinalAmount ?? d.final_amount ?? d.customer_final_amount) || null,
      currency: d.currency ?? d.currency_code ?? null,
      status: d.status ?? null,
      expires_at: d.expiresAt ?? d.expires_at ?? null,
      distance: toFinite(d.distanceKm ?? d.distance ?? inputSnapshot.distanceKm),
      duration: toFinite(d.durationMin ?? d.duration ?? inputSnapshot.durationMin),
      isExpired: typeof d.isExpired === 'boolean' ? d.isExpired : undefined,
    };
  }
}

module.exports = CustomerQuoteResponseDTO;