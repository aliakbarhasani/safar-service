'use strict';

/**
 * SmsProvider — Mock SMS provider (KavehNegar / Twilio)
 * Strategy pattern implementation for SMS notifications.
 */
class SmsProvider {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.name = 'SmsProvider';
    this._sentMessages = []; // For testing
  }

  /**
   * Send SMS to phone number
   * @param {string} phoneNumber — Target phone number
   * @param {string} text — SMS text content
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendSms(phoneNumber, text) {
    const messageId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    this.logger.info(`[SmsProvider] Sending SMS to ${phoneNumber}: ${text.slice(0, 50)}...`);
    
    const record = { phoneNumber, text, messageId, timestamp: new Date().toISOString() };
    this._sentMessages.push(record);

    return { success: true, messageId };
  }

  /**
   * Get all sent messages (for testing)
   * @returns {Array}
   */
  getSentMessages() {
    return [...this._sentMessages];
  }

  /**
   * Clear sent messages history (for testing)
   */
  clearHistory() {
    this._sentMessages = [];
  }
}

module.exports = { SmsProvider };