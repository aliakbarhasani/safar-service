/**
 * ProviderQuoteResponseDTO - Provider/Admin-Facing Quote DTO.
 *
 * BUSINESS RULE:
 * Only a PROVIDER (or Admin) is entitled to see the full fee breakdown
 * (gross amount, platform commission, tax, net-to-provider amount).
 *
 * This DTO is the counterpart of CustomerQuoteResponseDTO: it exposes the
 * transparent financial details NOT shown to the customer at the API boundary.
 */

function toFinite(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

class ProviderQuoteResponseDTO {
  /**
   * Build a provider-visible quote from internal quote data.
   * @param {object} d - internal/DB quote (use-case result)
   * @returns {{quote_id:*, gross_amount:*, commission_amount:*, tax_amount:*, net_provider_amount:*, currency:*, status:*, expires_at:*}}
   */
  static fromQuote(d = {}) {
    return {
      quote_id: d.quoteId ?? d.quote_id ?? null,
      gross_amount: toFinite(d.grossAmount ?? d.gross_amount),
      commission_amount: toFinite(d.commissionAmount ?? d.commission_amount),
      tax_amount: toFinite(d.taxAmount ?? d.tax_amount),
      net_provider_amount: toFinite(d.providerAmount ?? d.provider_amount ?? d.net_provider_amount),
      currency: d.currency ?? d.currency_code ?? null,
      status: d.status ?? null,
      expires_at: d.expiresAt ?? d.expires_at ?? null,
    };
  }
}

module.exports = ProviderQuoteResponseDTO;