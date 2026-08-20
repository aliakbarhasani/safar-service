/**
 * unit/Money.test.js
 *
 * Unit tests for the Money value object (domain layer).
 * Verifies exact decimal arithmetic via decimal.js (no JS floating-point
 * artifacts like 0.1 + 0.2 !== 0.3), Banker's rounding (HALF_EVEN), and the
 * output formatting helpers.
 */

const { Decimal } = require('decimal.js');
Decimal.set({ precision: 19, rounding: Decimal.ROUND_HALF_EVEN });

const Money = require('../../domain/Money');

describe('Money (domain value object)', () => {
  describe('exact decimal arithmetic (no floating-point artifacts)', () => {
    test('0.1 + 0.2 equals 0.3 exactly', () => {
      const result = new Money('0.1').add(new Money('0.2'));
      expect(result.toDatabaseFormat()).toBe('0.3');
      expect(new Decimal('0.1').plus(new Decimal('0.2')).toString()).toBe('0.3');
    });

    test('addition of large money values is exact', () => {
      const sum = new Money('999999999999.9999').add(new Money('0.0001'));
      expect(sum.toDatabaseFormat()).toBe('1000000000000');
    });

    test('subtraction is exact', () => {
      const result = new Money('1.00').subtract(new Money('0.99'));
      expect(result.toDatabaseFormat()).toBe('0.01');
    });

    test('0.3 - 0.1 - 0.2 equals zero (no drift)', () => {
      const result = new Money('0.3').subtract(new Money('0.1')).subtract(new Money('0.2'));
      expect(result.toDatabaseFormat()).toBe('0');
    });

    test('multiplication by an integer factor is exact', () => {
      // 4.35 * 100 should be exactly 435 — NOT 434.9999999...
      const result = new Money('4.35').multiply(100);
      expect(result.toDatabaseFormat()).toBe('435');
    });

    test('multiplication by a decimal factor is exact', () => {
      const result = new Money('10.00').multiply('1.5');
      expect(result.toDatabaseFormat()).toBe('15');
    });
  });

  describe('Banker\'s rounding (ROUND_HALF_EVEN)', () => {
    test('2.5 rounds to 2 at 0 decimal places (HALF_EVEN)', () => {
      const m = new Money('2.5');
      // toDisplayFormat uses toDecimalPlaces(0) -> HALF_EVEN -> 2
      expect(m.toDisplayFormat()).toBe('2');
    });

    test('3.5 rounds to 4 at 0 decimal places (HALF_EVEN)', () => {
      const m = new Money('3.5');
      expect(m.toDisplayFormat()).toBe('4');
    });

    test('1.5 rounds to 2 at 0 decimal places (HALF_EVEN)', () => {
      const m = new Money('1.5');
      expect(m.toDisplayFormat()).toBe('2');
    });

    test('0.5 rounds to 0 at 0 decimal places (HALF_EVEN)', () => {
      const m = new Money('0.5');
      expect(m.toDisplayFormat()).toBe('0');
    });

    test('toDatabaseFormat keeps up to 4 decimal places with HALF_EVEN', () => {
      // 2.5 at 4 decimals, trailing zeros trimmed by toString()
      expect(new Money('2.5').toDatabaseFormat()).toBe('2.5');
      // 2.50005 at 4 decimals -> HALF_EVEN -> 2.5000 (digit before is 0, even) -> trimmed '2.5'
      expect(new Money('2.50005').toDatabaseFormat()).toBe('2.5');
      // 1.23456 at 4 decimals -> HALF_EVEN -> 1.2346
      expect(new Money('1.23456').toDatabaseFormat()).toBe('1.2346');
    });
  });

  describe('output formatting (numeric and string)', () => {
    test('toDatabaseFormat returns a string with trailing zeros trimmed', () => {
      const m = new Money('123.4567');
      expect(m.toDatabaseFormat()).toBe('123.4567');
    });

    test('toDisplayFormat returns an integer string', () => {
      const m = new Money('123.75');
      expect(m.toDisplayFormat()).toBe('124');
    });

    test('getZero returns a zero Money', () => {
      const zero = Money.getZero();
      expect(zero.toDatabaseFormat()).toBe('0');
      expect(zero.toDisplayFormat()).toBe('0');
    });

    test('.amount is a Decimal instance (numeric arithmetic support)', () => {
      const m = new Money('42');
      expect(m.amount).toBeInstanceOf(Decimal);
      expect(m.amount.toString()).toBe('42');
    });
  });
});