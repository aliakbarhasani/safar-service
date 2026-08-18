const UserProfile = require('../../domain/entities/UserProfile');
const ProfileRepository = require('../../infrastructure/repositories/ProfileRepository');

class UpdateProfileUseCase {
  constructor({ profileRepository = null } = {}) {
    this.profileRepository = profileRepository || new ProfileRepository();
  }

  async execute(userId, updates) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    if (updates.email) {
      const profile = new UserProfile({ ...updates, userId });
      profile.validate();
    }

    const normalizedUpdates = {};
    if (updates.firstName) normalizedUpdates.firstName = updates.firstName;
    if (updates.lastName) normalizedUpdates.lastName = updates.lastName;
    if (updates.email) normalizedUpdates.email = updates.email;
    if (updates.avatarUrl) normalizedUpdates.avatarUrl = updates.avatarUrl;
    if (updates.nationalCode) normalizedUpdates.nationalCode = updates.nationalCode;

    const existing = await this.profileRepository.findProfileByUserId(userId);
    let result;
    if (existing) {
      result = await this.profileRepository.updateProfile(userId, normalizedUpdates);
    } else {
      result = await this.profileRepository.createProfile({
        userId,
        firstName: normalizedUpdates.firstName || null,
        lastName: normalizedUpdates.lastName || null,
        email: normalizedUpdates.email || null,
        avatarUrl: normalizedUpdates.avatarUrl || null,
        nationalCode: normalizedUpdates.nationalCode || null,
      });
    }

    return result;
  }
}

module.exports = UpdateProfileUseCase;