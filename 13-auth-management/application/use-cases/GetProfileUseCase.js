const ProfileRepository = require('../../infrastructure/repositories/ProfileRepository');

class GetProfileUseCase {
  constructor({ profileRepository = null } = {}) {
    this.profileRepository = profileRepository || new ProfileRepository();
  }

  async execute(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const profile = await this.profileRepository.findProfileByUserId(userId);
    const settings = await this.profileRepository.findSettingsByUserId(userId);

    return {
      profile: profile || null,
      settings: settings || null,
    };
  }
}

module.exports = GetProfileUseCase;