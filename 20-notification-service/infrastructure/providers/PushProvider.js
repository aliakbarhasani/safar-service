'use strict';

/**
 * PushProvider — Mock FCM provider
 * Strategy pattern implementation for push notifications.
 */
class PushProvider {
  constructor({ logger = console } = {}) {
    this.logger = logger;
    this.name = 'PushProvider';
    this._sentMessages = []; // For testing
  }

  /**
   * Send push notification to user device
   * @param {string} userId — Target user ID
   * @param {string} title — Notification title
   * @param {string} body — Notification body
   * @param {object} [data] — Extra payload data
   * @returns {Promise<{ success: boolean, messageId: string }>}
   */
  async sendPush(userId, title, body, data = {}) {
    const messageId = `push_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    this.logger.info(`[PushProvider] Sending push to user=${userId}: ${title}`);
    
    const record = { userId, title, body, data, messageId, timestamp: new Date().toISOString() };
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

module.exports = { PushProvider };