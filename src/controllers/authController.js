const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const authService = require('../services/authService');
const emailOtpService = require('../services/emailOtpService');
const { generateToken, decodeToken } = require('../utils/jwt');

class AuthController {
  async login(req, res) {
    try {
      const identifier = (req.body.username || req.body.email || req.body.identifier || '').trim();
      const { password } = req.body;
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Username or email and password are required' });
      }

      const user = await userRepository.findByUsernameOrEmail(identifier);
      if (!user) {
        return res.status(401).send('Invalid username or email, or incorrect password');
      }

      // Check if blocked (only applies to ROLE_USER)
      if (user.blocked && user.role === 'ROLE_USER') {
        return res.status(403).send('Your account has been blocked by the administrator. Please contact support for assistance.');
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).send('Invalid username or email, or incorrect password');
      }

      const userWithGroup = await userRepository.findByIdWithUserGroup(user.id);
      const token = generateToken(userWithGroup);
      const isGroupMember = !!userWithGroup.user_group_id;

      return res.status(200).json({
        token,
        type: 'Bearer',
        id: userWithGroup.id,
        username: userWithGroup.username,
        email: userWithGroup.email,
        firstName: userWithGroup.first_name || '',
        lastName: userWithGroup.last_name || '',
        country: userWithGroup.country || '',
        role: userWithGroup.role,
        isGroupMember,
      });
    } catch (error) {
      console.error('Login error:', error);
      return res.status(401).send(`Authentication failed: ${error.message}`);
    }
  }

  async sendOtp(req, res) {
    try {
      const { email } = req.body;
      if (!email || !email.trim()) {
        return res.status(400).send('Email is required');
      }

      await emailOtpService.sendOtp(email.trim());
      return res.status(200).json({ message: 'OTP sent successfully', success: true });
    } catch (error) {
      console.error('Send OTP error:', error);
      return res.status(400).json({ message: error.message, success: false });
    }
  }

  async verifyOtp(req, res) {
    try {
      const { email, otp } = req.body;
      if (!email || !otp) {
        return res.status(400).json({ verified: false, message: 'Email and OTP are required' });
      }

      const verified = await emailOtpService.verifyOtp(email.trim(), otp.trim());
      if (verified) {
        return res.status(200).json({ verified: true, message: 'Email verified successfully' });
      } else {
        return res.status(400).json({ verified: false, message: 'Invalid or expired OTP' });
      }
    } catch (error) {
      console.error('Verify OTP error:', error);
      return res.status(400).json({ verified: false, message: error.message });
    }
  }

  async register(req, res) {
    try {
      const { username, email, password, firstName, lastName, country, role, occupationId } = req.body;

      if (!username || !email || !password) {
        return res.status(400).send('Username, email, and password are required');
      }

      // Verify email OTP was completed
      const isVerified = await emailOtpService.isEmailVerified(email);
      if (!isVerified) {
        return res.status(400).send('Email not verified. Please verify your email with OTP first.');
      }

      if (await authService.existsByUsername(username)) {
        return res.status(400).send('Error: Username is already taken!');
      }

      if (await authService.existsByEmail(email)) {
        return res.status(400).send('Error: Email is already in use!');
      }

      const user = await authService.registerUser({
        username,
        email,
        password,
        firstName,
        lastName,
        country,
        role,
        occupationId,
      });

      const token = generateToken(user);
      const isGroupMember = !!user.user_group_id;

      return res.status(200).json({
        token,
        type: 'Bearer',
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        country: user.country || '',
        role: user.role,
        isGroupMember,
      });
    } catch (error) {
      console.error('Registration error:', error);
      return res.status(400).send(`Registration failed: ${error.message}`);
    }
  }

  async verify(req, res) {
    try {
      const user = req.user;
      const isGroupMember = !!user.user_group_id;

      return res.status(200).json({
        token: '',
        type: 'Bearer',
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        country: user.country || '',
        role: user.role,
        isGroupMember,
      });
    } catch (error) {
      console.error('Verify token error:', error);
      return res.status(500).send(`Token verification failed: ${error.message}`);
    }
  }

  async health(req, res) {
    return res.status(200).send('OK');
  }

  async googleAuth(req, res) {
    try {
      let { googleToken, email, firstName, lastName } = req.body;
      if (!googleToken && !email) {
        return res.status(400).send('Google token or email is required');
      }

      // If googleToken JWT is present, extract claims
      if (googleToken && !email) {
        const payload = decodeToken(googleToken);
        if (payload && payload.email) {
          email = payload.email;
          firstName = payload.given_name || payload.name || firstName || '';
          lastName = payload.family_name || lastName || '';
        }
      }

      if (!email) {
        return res.status(401).send('Email not found in Google authentication response');
      }

      const user = await authService.findOrCreateGoogleUser(email, firstName, lastName);

      // Check if blocked
      if (user.blocked && user.role === 'ROLE_USER') {
        return res.status(403).send('Your account has been blocked. Please contact support.');
      }

      const token = generateToken(user);
      const isGroupMember = !!user.user_group_id;

      return res.status(200).json({
        token,
        type: 'Bearer',
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        country: user.country || '',
        role: user.role,
        isGroupMember,
      });
    } catch (error) {
      console.error('Google auth error:', error);
      return res.status(500).send(`Google authentication failed: ${error.message}`);
    }
  }

  // Aliases for route flexibility
  async healthCheck(req, res) {
    return this.health(req, res);
  }

  async googleLogin(req, res) {
    return this.googleAuth(req, res);
  }

  async verifyToken(req, res) {
    return this.verify(req, res);
  }
}

module.exports = new AuthController();
