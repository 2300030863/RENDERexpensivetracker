const userProfileService = require('../services/userProfileService');

class UserProfileController {
  async getUserProfile(req, res, next) {
    try {
      const profile = await userProfileService.getUserProfile(req.user);
      return res.status(200).json(profile);
    } catch (error) {
      console.error('Get profile error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  async updateUserProfile(req, res, next) {
    try {
      const updatedProfile = await userProfileService.updateUserProfile(req.user, req.body);
      return res.status(200).json(updatedProfile);
    } catch (error) {
      console.error('Update profile error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  async changePassword(req, res, next) {
    try {
      await userProfileService.changePassword(req.user, req.body);
      return res.status(200).send();
    } catch (error) {
      console.error('Change password error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  async deleteMyAccount(req, res, next) {
    try {
      await userProfileService.deleteMyAccount(req.user);
      return res.status(200).json({ message: 'Account deleted successfully' });
    } catch (error) {
      console.error('Delete account error:', error);
      return res.status(400).json({ error: error.message });
    }
  }

  // Aliases for route flexibility
  async getProfile(req, res, next) {
    return this.getUserProfile(req, res, next);
  }

  async updateProfile(req, res, next) {
    return this.updateUserProfile(req, res, next);
  }
}

module.exports = new UserProfileController();
