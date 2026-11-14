const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const userRepository = require('../repositories/userRepository');
const occupationService = require('./occupationService');

class AuthService {
  async existsByUsername(username) {
    return await userRepository.existsByUsername(username);
  }

  async existsByEmail(email) {
    return await userRepository.existsByEmail(email);
  }

  async registerUser(registerRequest) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(registerRequest.password, salt);

    const newUser = await userRepository.create({
      username: registerRequest.username,
      email: registerRequest.email,
      password: hashedPassword,
      firstName: registerRequest.firstName || '',
      lastName: registerRequest.lastName || '',
      country: registerRequest.country || 'India',
      role: registerRequest.role || 'ROLE_USER',
      occupationId: registerRequest.occupationId || null,
      isOAuthUser: false,
    });

    // Generate occupation categories if requested
    if (registerRequest.occupationId) {
      try {
        await occupationService.generateCategoriesForUser(newUser, registerRequest.occupationId);
      } catch (err) {
        console.error('Failed to generate occupation categories:', err.message);
      }
    }

    return await userRepository.findByIdWithUserGroup(newUser.id);
  }

  async findOrCreateGoogleUser(email, firstName, lastName) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      return await userRepository.findByIdWithUserGroup(existingUser.id);
    }

    // Generate unique username from email
    const baseUsername = email.split('@')[0];
    let username = baseUsername;
    let counter = 1;
    while (await userRepository.existsByUsername(username)) {
      username = `${baseUsername}${counter}`;
      counter++;
    }

    const salt = await bcrypt.genSalt(10);
    const randomPassword = await bcrypt.hash(uuidv4(), salt);

    const newUser = await userRepository.create({
      username,
      email,
      password: randomPassword,
      firstName: firstName || '',
      lastName: lastName || '',
      country: 'US',
      role: 'ROLE_USER',
      isOAuthUser: true,
    });

    return await userRepository.findByIdWithUserGroup(newUser.id);
  }
}

module.exports = new AuthService();

