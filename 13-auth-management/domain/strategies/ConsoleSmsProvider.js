const SmsProviderStrategy = require('./SmsProviderStrategy');

/**
 * ConsoleSmsProvider - Strategy for development/testing
 * Logs OTP codes to console instead of sending real SMS
 */
class ConsoleSmsProvider extends SmsProviderStrategy {
  constructor(config = {}) {
    super('console', config);
  }

  async send(recipient, message) {
    if (!this.validateRecipient(recipient)) {
      throw new Error(`Invalid phone number: ${recipient}`);
    }

    console.log(`[SMS][Console] To: ${recipient} | Message: ${message}`);
    return {
      success: true,
      provider: this.name,
      recipient,
      messageId: `console-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    };
  }
}

module.exports = ConsoleSmsProvider;