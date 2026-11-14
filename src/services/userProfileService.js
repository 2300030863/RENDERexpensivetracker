const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');
const occupationRepository = require('../repositories/occupationRepository');

class UserProfileService {
  async getUserProfile(user) {
    const managedUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!managedUser) throw new Error('User not found');

    let occupationName = null;
    if (managedUser.occupation_id) {
      const occupation = await occupationRepository.findById(managedUser.occupation_id);
      if (occupation) occupationName = occupation.name;
    }

    return {
      id: managedUser.id,
      username: managedUser.username,
      email: managedUser.email,
      firstName: managedUser.first_name || '',
      lastName: managedUser.last_name || '',
      country: managedUser.country || '',
      isOAuthUser: !!managedUser.is_oauth_user,
      occupationId: managedUser.occupation_id || null,
      occupationName,
    };
  }

  async updateUserProfile(user, request) {
    const managedUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!managedUser) throw new Error('User not found');

    // Check username uniqueness
    if (request.username && request.username !== managedUser.username) {
      const exists = await userRepository.existsByUsername(request.username);
      if (exists) throw new Error('Username is already taken');
    }

    // Check email uniqueness
    if (request.email && request.email !== managedUser.email) {
      const exists = await userRepository.existsByEmail(request.email);
      if (exists) throw new Error('Email is already taken');
    }

    const countryChanged = request.country && request.country !== managedUser.country;

    const fieldsToUpdate = {
      username: request.username || managedUser.username,
      email: request.email || managedUser.email,
      firstName: request.firstName !== undefined ? request.firstName : managedUser.first_name,
      lastName: request.lastName !== undefined ? request.lastName : managedUser.last_name,
      country: request.country !== undefined ? request.country : managedUser.country,
      occupationId: request.occupationId !== undefined ? request.occupationId : managedUser.occupation_id,
    };

    await userRepository.update(managedUser.id, fieldsToUpdate);

    // If admin and country changed, sync with all group members
    if (countryChanged && managedUser.role === 'ROLE_ADMIN') {
      try {
        const admin = await adminRepository.findByUsername(managedUser.username);
        if (admin) {
          const groupUsers = await userRepository.findByUserGroupAdminId(admin.id);
          for (const member of groupUsers) {
            await userRepository.update(member.id, { country: request.country });
          }
        }
      } catch (err) {
        console.error('Failed to sync country with group members:', err);
      }
    }

    return await this.getUserProfile({ id: managedUser.id });
  }

  async changePassword(user, request) {
    const managedUser = await userRepository.findById(user.id);
    if (!managedUser) throw new Error('User not found');

    // OAuth user setting password for the first time
    if (managedUser.is_oauth_user && (!request.currentPassword || request.currentPassword.trim() === '')) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(request.newPassword, salt);
      await userRepository.update(managedUser.id, {
        password: hashedPassword,
        is_oauth_user: false,
      });
      return;
    }

    // Non-OAuth or OAuth user who has a password: verify current password
    const isMatch = await bcrypt.compare(request.currentPassword, managedUser.password);
    if (!isMatch) {
      throw new Error('Current password is incorrect');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(request.newPassword, salt);
    await userRepository.update(managedUser.id, { password: hashedPassword });
  }
}

module.exports = new UserProfileService();

