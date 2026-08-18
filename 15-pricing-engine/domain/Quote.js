class Quote {
    constructor({ pricingConfigId, serviceType, currencyCode = 'IRT', referenceId = null }) {
        this.pricingConfigId = pricingConfigId;
        this.serviceType = serviceType;
        this.currencyCode = currencyCode;
        this.referenceId = referenceId;
        this.status = 'CREATED';
        this.expiresAt = this._calculateExpiration(10);
    }

    _calculateExpiration(minutes) {
        const date = new Date();
        date.setMinutes(date.getMinutes() + minutes);
        return date;
    }

    applyCalculationResult(calculationResult, inputSnapshot, ruleSnapshot) {
        this.amounts = calculationResult.amounts;
        this.calculationSnapshot = calculationResult.calculationSteps;
        this.inputSnapshot = inputSnapshot;
        this.ruleSnapshot = ruleSnapshot;
    }

    toDatabaseRecord() {
        if (!this.amounts) throw new Error("Quote calculation missing");

        return {
            reference_id: this.referenceId,
            pricing_config_id: this.pricingConfigId,
            service_type: this.serviceType,
            currency_code: this.currencyCode,
            gross_amount: this.amounts.gross.toDatabaseFormat(),
            discount_amount: this.amounts.discount.toDatabaseFormat(),
            tax_amount: this.amounts.tax.toDatabaseFormat(),
            commission_amount: this.amounts.commission.toDatabaseFormat(),
            provider_amount: this.amounts.provider.toDatabaseFormat(),
            customer_final_amount: this.amounts.customerFinal.toDatabaseFormat(),
            status: this.status,
            input_snapshot: JSON.stringify(this.inputSnapshot),
            calculation_snapshot: JSON.stringify(this.calculationSnapshot),
            expires_at: this.expiresAt.toISOString()
        };
    }
}

module.exports = Quote;