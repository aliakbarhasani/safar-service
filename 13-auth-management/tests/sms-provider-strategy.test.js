const SmsProviderStrategy = require('../domain/strategies/SmsProviderStrategy');
const ConsoleSmsProvider = require('../domain/strategies/ConsoleSmsProvider');

describe('SMS provider recipient validation', () => {
  const strategy = new SmsProviderStrategy('test');

  test.each([
    ['Afghan national', '0701234567'],
    ['Afghan international', '+93701234567'],
    ['Afghan international dialing prefix', '0093701234567'],
    ['Iranian national', '09123456789'],
    ['Iranian international', '+989123456789'],
    ['generic international E.164', '+14155552671'],
  ])('accepts %s', (_label, phone) => {
    expect(strategy.validateRecipient(phone)).toBe(true);
  });

  test.each(['', '1234567890', '070123', '+00123456789', null, undefined, 123])(
    'rejects invalid recipient %s safely',
    (phone) => {
      expect(strategy.validateRecipient(phone)).toBe(false);
    },
  );

  test('console provider accepts Afghan national number for local/test OTP flow', async () => {
    const provider = new ConsoleSmsProvider();
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});

    await expect(provider.send('0701234567', 'test OTP')).resolves.toMatchObject({
      success: true,
      provider: 'console',
      recipient: '0701234567',
    });

    log.mockRestore();
  });
});
