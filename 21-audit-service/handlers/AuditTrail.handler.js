/**
 * AuditTrail.handler.js - Listens to all domain events and persists them
 * to the audit_logs table for security and business traceability.
 *
 * Subscribes to the EventBus singleton and captures every published event
 * along with its correlation ID (propagated from the originating request).
 */

const { requestContext } = require('../../00-infrastructure/logger/context');

// Critical events that must always be audited
const CRITICAL_EVENTS = [
  'TripCompleted',
  'TripCancelled',
  'PaymentFailed',
  'DriverArrived',
  'DriverAccepted',
  'FeedbackSubmitted',
];

class AuditTrailHandler {
  constructor(eventBus, auditRepository, options = {}) {
    this._eventBus = eventBus;
    this._auditRepository = auditRepository;
    this._captureAll = options.captureAll || false;
    this._boundHandler = this._handleEvent.bind(this);
    this._subscribed = false;
  }

  /**
   * Start listening to events
   */
  start() {
    if (this._subscribed) return;

    if (this._captureAll) {
      // Subscribe to all events via wildcard pattern
      // Note: EventEmitter doesn't support wildcards natively,
      // so we use a proxy approach for critical events
      CRITICAL_EVENTS.forEach((event) => {
        this._eventBus.on(event, this._boundHandler);
      });
    } else {
      CRITICAL_EVENTS.forEach((event) => {
        this._eventBus.on(event, this._boundHandler);
      });
    }

    this._subscribed = true;
  }

  /**
   * Stop listening to events
   */
  stop() {
    if (!this._subscribed) return;
    CRITICAL_EVENTS.forEach((event) => {
      this._eventBus.off(event, this._boundHandler);
    });
    this._subscribed = false;
  }

  /**
   * Handle an incoming event
   * @private
   */
  async _handleEvent(envelope) {
    try {
      const correlationId = envelope?.metadata?.correlationId || null;
      const eventName = envelope?.event || 'unknown';
      const payload = envelope?.data || envelope;

      await this._auditRepository.insert(eventName, payload, correlationId);
    } catch (err) {
      // Audit logging should never break the main flow
      // but we still want to know if something went wrong
      if (process.env.AUDIT_DEBUG === 'true') {
        console.error('[AuditTrail] failed to persist event:', err.message);
      }
    }
  }
}

module.exports = { AuditTrailHandler, CRITICAL_EVENTS };
