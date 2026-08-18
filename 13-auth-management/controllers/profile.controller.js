const GetProfileUseCase = require('../application/use-cases/GetProfileUseCase');
const UpdateProfileUseCase = require('../application/use-cases/UpdateProfileUseCase');
const UpdateSettingsUseCase = require('../application/use-cases/UpdateSettingsUseCase');

class ProfileController {
  constructor({
    getProfileUseCase = null,
    updateProfileUseCase = null,
    updateSettingsUseCase = null,
  } = {}) {
    this.getProfileUseCase = getProfileUseCase || new GetProfileUseCase();
    this.updateProfileUseCase = updateProfileUseCase || new UpdateProfileUseCase();
    this.updateSettingsUseCase = updateSettingsUseCase || new UpdateSettingsUseCase();
  }

  async getProfile(req, res) {
    try {
      const userId = req.user.userId;
      const result = await this.getProfileUseCase.execute(userId);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[ProfileController] getProfile error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const userId = req.user.userId;
      const result = await this.updateProfileUseCase.execute(userId, req.body);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[ProfileController] updateProfile error:', err);
      return res.status(400).json({ error: err.message });
    }
  }

  async updateSettings(req, res) {
    try {
      const userId = req.user.userId;
      const result = await this.updateSettingsUseCase.execute(userId, req.body);
      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      console.error('[ProfileController] updateSettings error:', err);
      return res.status(400).json({ error: err.message });
    }
  }
}

module.exports = ProfileController;