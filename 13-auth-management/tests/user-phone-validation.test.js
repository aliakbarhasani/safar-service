const User = require('../domain/entities/User');

describe('User phone number validation', () => {
  const user = new User({
    phoneNumber: '09123456789',
    firstName: 'Ali',
    lastName: 'Hasani',
    passwordHash: 'test-hash',
  });

  test.each([
    ['Iranian national format', '09123456789'],
    ['Iranian national format without leading zero', '9123456789'],
    ['Iranian international format', '+989123456789'],
    ['Iranian international format without plus', '989123456789'],
    ['Afghan national format', '0701234567'],
    ['Afghan national format without leading zero', '701234567'],
    ['Afghan international format', '+93701234567'],
    ['Afghan international format without plus', '93701234567'],
    ['generic international E.164 format', '+14155552671'],
  ])('accepts %s', (_description, phoneNumber) => {
    expect(user._isValidPhoneNumber(phoneNumber)).toBe(true);
  });

  test.each([
    ['arbitrary ten-digit number', '1234567890'],
    ['too-short number', '09123'],
    ['invalid international prefix', '+00123456789'],
    ['letters in number', '09ABC456789'],
    ['empty input', ''],
  ])('rejects %s', (_description, phoneNumber) => {
    expect(user._isValidPhoneNumber(phoneNumber)).toBe(false);
  });

  test('the domain entity rejects invalid phone numbers during full validation', () => {
    const invalidUser = new User({
      phoneNumber: '1234567890',
      firstName: 'Ali',
      lastName: 'Hasani',
      passwordHash: 'test-hash',
    });

    expect(invalidUser.isValid()).toEqual(
      expect.objectContaining({
        isValid: false,
        errors: expect.arrayContaining(['Invalid or missing phone number']),
      }),
    );
  });
});
