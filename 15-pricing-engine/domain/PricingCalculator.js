const Money = require('./Money');

class PricingCalculator {
    static calculateQuote(config, distanceKm, durationMin, trafficMultiplier = 1.0) {
        const baseFare = new Money(config.base_fare);
        const distanceCost = new Money(config.price_per_km).multiply(distanceKm);
        const timeCost = new Money(config.price_per_minute).multiply(durationMin);

        let subTotal = baseFare.add(distanceCost).add(timeCost);
        let grossAmount = subTotal.multiply(trafficMultiplier);

        const minimumFare = new Money(config.minimum_fare);
        if (grossAmount.amount.lessThan(minimumFare.amount)) {
            grossAmount = minimumFare;
        }

        const commissionAmount = grossAmount.multiply(config.commission_rate);
        const providerAmount = grossAmount.subtract(commissionAmount);
        const customerFinalAmount = grossAmount;

        return {
            amounts: {
                gross: grossAmount,
                commission: commissionAmount,
                provider: providerAmount,
                customerFinal: customerFinalAmount,
                discount: Money.getZero(),
                tax: Money.getZero()
            },
            calculationSteps: {
                baseFare: baseFare.toDatabaseFormat(),
                distanceCost: distanceCost.toDatabaseFormat(),
                timeCost: timeCost.toDatabaseFormat(),
                trafficMultiplier,
                appliedMinimumFare: grossAmount.amount.equals(minimumFare.amount)
            }
        };
    }
}

module.exports = PricingCalculator;