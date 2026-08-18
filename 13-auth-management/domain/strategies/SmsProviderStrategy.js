/**
 * SMS Provider Strategy - برای ارسال پیامک از طریق پنل‌های مختلف
 */

class SmsProviderStrategy {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.enabled = true;
  }

  async send(recipient, message) {
    throw new Error('send() method must be implemented by concrete strategy');
  }

  validateRecipient(recipient) {
    const cleaned = recipient.replace(/\s/g, '');
    return /^(\+98|0)?9\d{9}$|^(\+98|0)?\d{10}$/.test(cleaned);
  }
}

module.exports = SmsProviderStrategy;