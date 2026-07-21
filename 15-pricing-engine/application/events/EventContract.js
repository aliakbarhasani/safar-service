const crypto = require('crypto');

class EventContract {
  static create(params) {
    const { eventType, payload, correlationId, causationId, producer } = params;
    return {
      eventId: crypto.randomUUID(),
      eventVersion: '1.0.0',
      schemaVersion: '1.0.0',
      correlationId: correlationId || '',
      causationId: causationId || '',
      traceId: correlationId || crypto.randomUUID(),
      producer: producer || 'pricing-engine',
      occurredAt: new Date().toISOString(),
      eventType,
      payload,
    };
  }

  static get EventTypes() {
    return {
      QUOTE_GENERATED: 'QuoteGenerated',
      QUOTE_EXPIRED: 'QuoteExpired',
      QUOTE_USED: 'QuoteUsed',
      QUOTE_CANCELLED: 'QuoteCancelled',
      QUOTE_RECALCULATED: 'QuoteRecalculated',
      RULE_CREATED: 'RuleCreated',
      RULE_UPDATED: 'RuleUpdated',
      RULE_DELETED: 'RuleDeleted',
      SURGE_ACTIVATED: 'SurgeActivated',
      SURGE_DEACTIVATED: 'SurgeDeactivated',
      MULTIPLIER_UPDATED: 'MultiplierUpdated',
      ENGINE_CONFIG_CHANGED: 'EngineConfigChanged',
      ENGINE_VERSION_CHANGED: 'EngineVersionChanged',
    };
  }

  static validate(event) {
    const required = ['eventId', 'eventVersion', 'schemaVersion',
      'traceId', 'producer', 'occurredAt', 'eventType', 'payload'];
    for (const field of required) {
      if (!event[field]) return false;
    }
    return true;
  }
}

module.exports = EventContract;