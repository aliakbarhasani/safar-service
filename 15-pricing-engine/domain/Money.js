const Decimal = require('decimal.js');
Decimal.set({ precision: 19, rounding: Decimal.ROUND_HALF_EVEN });

class Money {
    constructor(amount) {
        this.amount = new Decimal(amount);
    }

    add(money) { return new Money(this.amount.plus(money.amount)); }
    subtract(money) { return new Money(this.amount.minus(money.amount)); }
    multiply(factor) { return new Money(this.amount.times(factor)); }
    
    toDatabaseFormat() { return this.amount.toDecimalPlaces(4).toString(); }
    toDisplayFormat() { return this.amount.toDecimalPlaces(0).toString(); }
    
    static getZero() { return new Money(0); }
}

module.exports = Money;