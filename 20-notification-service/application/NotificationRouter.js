'use strict';

/**
 * NotificationRouter — Omni-channel notification dispatcher
 * Uses Strategy pattern to route messages through different providers.
 *
 * Supported channels: 'push', 'sms'
 * Fallback mechanism: critical events always send SMS as backup.
 */
class NotificationRouter {
  constructor({
    pushProvider,
    smsProvider,
    userRepository,
    logger = console,
  } = {}) {
    this.pushProvider = pushProvider;
    this.smsProvider = smsProvider;
    this.userRepository = userRepository;
    this.logger = logger;

    // Template registry: eventName -> { title, body builder, forceSms }
    this._templates = {
      DriverArrived: {
        title: 'راننده رسید',
        buildBody: (payload) => 'راننده شما به محل سوار شدن رسید. لطفاً به محل تجمع مراجعه کنید.',
        forceSms: false,
      },
      DriverOffered: {
        title: 'پیشنهاد سفر جدید',
        buildBody: (payload) => `یک سفر جدید با مسافت ${payload.distanceKm?.toFixed(1) || '?'} کیلومتر به شما پیشنهاد شده است.`,
        forceSms: false,
      },
      TripStarted: {
        title: 'سفر شروع شد',
        buildBody: (payload) => 'سفر شما آغاز شد. خوش بگذرد!',
        forceSms: false,
      },
      TripCompleted: {
        title: 'سفر به پایان رسید',
        buildBody: (payload) => `سفر شما با مبلغ ${payload.amount?.toLocaleString('fa-IR') || '?'} تومان به پایان رسید.`,
        forceSms: false,
      },
      TripCancelled: {
        title: 'سفر لغو شد',
        buildBody: (payload) => {
          if (payload.cancelledByRole === 'passenger') {
            return 'سفر توسط مسافر لغو شد.';
          }
          if (payload.cancelledByRole === 'driver') {
            return 'سفر توسط راننده لغو شد.';
          }
          return 'سفر شما لغو شد.';
        },
        forceSms: false,
      },
      DispatchFailed: {
        title: 'راننده یافت نشد',
        buildBody: () => 'متأسفانه در حال حاضر راننده‌ای یافت نشد. لطفاً دوباره تلاش کنید.',
        forceSms: true, // Critical: always send SMS
      },
      NoDriverFound: {
        title: 'راننده یافت نشد',
        buildBody: () => 'متأسفانه در حال حاضر راننده‌ای در منطقه شما یافت نشد. لطفاً دوباره تلاش کنید.',
        forceSms: true, // Critical: always send SMS
      },
    };
  }

  /**
   * Register a custom template for an event
   * @param {string} eventName
   * @param {{ title: string, buildBody: Function, forceSms?: boolean }} template
   */
  registerTemplate(eventName, template) {
    this._templates[eventName] = template;
  }

  /**
   * Get template for event
   * @param {string} eventName
   * @returns {{ title: string, buildBody: Function, forceSms: boolean }}
   */
  getTemplate(eventName) {
    return this._templates[eventName] || {
      title: 'اعلان جدید',
      buildBody: () => 'شما یک اعلان جدید دارید.',
      forceSms: false,
    };
  }

  /**
   * Dispatch notification to user
   * @param {string} userId — Target user ID
   * @param {string} eventName — Event name (e.g., 'DriverArrived')
   * @param {object} payload — Event data for template
   * @param {string[]} [channels=['push']] — Preferred channels
   * @returns {Promise<{ pushResult?: object, smsResult?: object, channels: string[] }>}
   */
  async dispatch(userId, eventName, payload = {}, channels = ['push']) {
    const template = this.getTemplate(eventName);
    const title = template.title;
    const body = template.buildBody(payload);

    const result = { channels: [] };

    // Try push notification
    if (channels.includes('push') && this.pushProvider) {
      try {
        const pushResult = await this.pushProvider.sendPush(userId, title, body, { eventName, ...payload });
        result.pushResult = pushResult;
        result.channels.push('push');
      } catch (err) {
        this.logger.warn(`[NotificationRouter] Push failed for user=${userId}: ${err.message}`);
        result.pushError = err.message;
      }
    }

    // Fallback: send SMS for critical events or when push fails
    const pushFailed = !result.pushResult?.success;
    const isCritical = template.forceSms;

    if ((isCritical || pushFailed) && this.smsProvider) {
      try {
        // Get user phone number from repository (fallback to userId for mock)
        let phoneNumber = payload.phoneNumber || userId;
        if (this.userRepository) {
          const user = await this.userRepository.findById(userId);
          phoneNumber = user?.phoneNumber || user?.phone || phoneNumber;
        }

        const smsResult = await this.smsProvider.sendSms(phoneNumber, body);
        result.smsResult = smsResult;
        result.channels.push('sms');
      } catch (err) {
        this.logger.warn(`[NotificationRouter] SMS failed for user=${userId}: ${err.message}`);
        result.smsError = err.message;
      }
    }

    return result;
  }

  /**
   * Send to multiple users
   * @param {string[]} userIds
   * @param {string} eventName
   * @param {object} payload
   * @param {string[]} [channels]
   * @returns {Promise<Array>}
   */
  async dispatchToMany(userIds, eventName, payload, channels) {
    const results = await Promise.all(
      userIds.map((userId) => this.dispatch(userId, eventName, payload, channels))
    );
    return results;
  }
}

module.exports = { NotificationRouter };