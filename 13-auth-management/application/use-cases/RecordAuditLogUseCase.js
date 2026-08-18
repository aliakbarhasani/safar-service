const AuditLogRepository = require('../../infrastructure/repositories/AuditLogRepository');

/**
 * RecordAuditLogUseCase
 * Records a system-wide audit log entry for critical actions.
 */
class RecordAuditLogUseCase {
  constructor({ auditLogRepository = null } = {}) {
    this.auditLogRepository = auditLogRepository || new AuditLogRepository();
  }

  /**
   * Execute the use case.
   * @param {Object} params - { userId, action, moduleName, entityType, entityId, oldValues, newValues, ipAddress, userAgent, metadata }
   */
  async execute(params) {
    if (!params || !params.action) {
      throw new Error('action is required for audit log');
    }

    const entry = {
      userId: params.userId || null,
      action: params.action,
      moduleName: params.moduleName || 'auth',
      entityType: params.entityType || null,
      entityId: params.entityId || null,
      oldValues: params.oldValues || null,
      newValues: params.newValues || null,
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      metadata: params.metadata || null,
    };

    await this.auditLogRepository.record(entry);
    return { success: true };
  }
}

module.exports = RecordAuditLogUseCase;