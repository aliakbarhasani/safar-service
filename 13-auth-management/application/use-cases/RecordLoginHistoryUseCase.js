const LoginHistoryRepository = require('../../infrastructure/repositories/LoginHistoryRepository');

/**
 * RecordLoginHistoryUseCase
 * Records a login attempt (success or failure) to the login_history table.
 */
class RecordLoginHistoryUseCase {
  constructor({ loginHistoryRepository = null } = {}) {
    this.loginHistoryRepository = loginHistoryRepository || new LoginHistoryRepository();
  }

  /**
   * Execute the use case.
   * @param {Object} params - { userId, phoneNumber, loginType, status, ipAddress, userAgent, failureReason }
   */
  async execute(params) {
    if (!params || !params.phoneNumber) {
      throw new Error('phoneNumber is required for login history');
    }

    const entry = {
      userId: params.userId || null,
      phoneNumber: params.phoneNumber,
      loginType: params.loginType || 'otp',
      status: params.status || 'success',
      ipAddress: params.ipAddress || null,
      userAgent: params.userAgent || null,
      failureReason: params.failureReason || null,
    };

    await this.loginHistoryRepository.record(entry);
    return { success: true };
  }
}

module.exports = RecordLoginHistoryUseCase;