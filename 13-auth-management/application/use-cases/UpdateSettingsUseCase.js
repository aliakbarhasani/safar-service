const UserSettings = require('../../domain/entities/UserSettings');
const ProfileRepository = require('../../infrastructure/repositories/ProfileRepository');

class UpdateSettingsUseCase {
  constructor({ profileRepository = null } = {}) {
    this.profileRepository = profileRepository || new ProfileRepository();
  }

  async execute(userId, updates) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const settings = new UserSettings({ ...updates, userId });
    settings.validate();

    const normalizedUpdates = {};
    if (updates.language) normalizedUpdates.language = updates.language;
    if (updates.currency) normalizedUpdates.currency = updates.currency;
    if (updates.country) normalizedUpdates.country = updates.country;
    if (updates.timezone) normalizedUpdates.timezone = updates.timezone;
    if (updates.notificationsEnabled !== undefined) normalizedUpdates.notificationsEnabled = updates.notificationsEnabled;

    const existing = await this.profileRepository.findSettingsByUserId(userId);
    let result;
    if (existing) {
      result = await this.profileRepository.updateSettings(userId, normalizedUpdates);
    } else {
      result = await this.profileRepository.createSettings({
        userId,
        language: normalizedUpdates.language || 'fa',
        currency: normalizedUpdates.currency || 'IRR',
        country: normalizedUpdates.country || 'IR',
        timezone: normalizedUpdates.timezone || 'Asia/Tehran',
        notificationsEnabled: normalizedUpdates.notificationsEnabled !== undefined ? normalizedUpdates.notificationsEnabled : true,
      });
    }

    return result;
  }
}

module.exports = UpdateSettingsUseCase;