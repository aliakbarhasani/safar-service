/**
 * SMS Provider Strategy - برای ارسال پیامک از طریق پنل‌های مختلف
 */

const { normalizePhoneNumber } = require('../services/PhoneNumber');

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
    // Reuse the canonical validator so Afghan numbers are not accidentally
    // rejected by this Iran-centric adapter. This provider is still console-only.
    return normalizePhoneNumber(recipient) !== null;
  }
}

module.exports = SmsProviderStrategy;