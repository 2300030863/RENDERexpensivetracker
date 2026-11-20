const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const emailOtpRepository = require('../repositories/emailOtpRepository');
const authService = require('../services/authService');
const emailOtpService = require('../services/emailOtpService');
const googleAuthService = require('../services/googleAuthService');
const { generateToken } = require('../utils/jwt');
const { badRequest } = require('../utils/httpError');
const {
  normalizeEmail,
  isValidEmail,
  isValidUsername,
  assertPassword,
  asString,
} = require('../utils/validate');

const isProduction = process.env.NODE_ENV === 'production';

const isBlocked = (val) => {
  if (val === null || val === undefined) return false;
  if (Buffer.isBuffer(val)) return val.length > 0 && val[0] === 1;
  return val === true || val === 1 || val === '1';
};

// A real bcrypt hash used to keep login timing the same whether or not the user exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-not-a-real-password', 10);

function buildSessionResponse(user) {
  return {
    token: generateToken(user),
    type: 'Bearer',
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    country: user.country || '',
    role: user.role,
    isGroupMember: !!user.user_group_id,
  };
}

class AuthController {
  async login(req, res) {
    try {
      const identifier = asString(req.body.username || req.body.email || req.body.identifier).trim();
      const password = asString(req.body.password);
      if (!identifier || !password) {
        return res.status(400).json({ error: 'Username or email and password are required' });
      }

      const user = await userRepository.findByUsernameOrEmail(identifier);

      // Always run one bcrypt comparison so response time does not reveal valid usernames.
      const isMatch = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
      if (!user || !isMatch) {
        return res.status(401).json({ error: 'Unauthorized', code: '401', status: 401 });
      }

      // Only tell the caller the account is restricted once they proved they own it.
      if (isBlocked(user.blocked) && user.role === 'ROLE_USER') {
        return res.status(403).json({ error: 'Forbidden', code: '403', status: 403 });
      }

      const userWithGroup = await userRepository.findByIdWithUserGroup(user.id);
      return res.status(200).json(buildSessionResponse(userWithGroup));
    } catch (error) {
      console.error('Login error:', error.message);
      return res.status(401).json({ error: 'Unauthorized', code: '401', status: 401 });
    }
  }

  async sendOtp(req, res) {
    try {
      const email = normalizeEmail(req.body.email);
      if (!email) {
        return res.status(400).json({ message: 'Email is required', success: false });
      }
      if (!isValidEmail(email)) {
        return res.status(400).json({ message: 'Please enter a valid email address', success: false });
      }

      const result = await emailOtpService.sendOtp(email);
      return res.status(200).json({
        message: result.delivered ? 'OTP sent successfully to your email' : 'OTP generated successfully',
        success: true,
        delivered: result.delivered,
        // The code is only echoed back outside production, and only when email delivery failed.
        devOtp: isProduction ? undefined : result.devOtp,
      });
    } catch (error) {
      console.error('Send OTP error:', error.message);
      const known = /already registered/i.test(error.message);
      return res.status(400).json({
        message: known ? error.message : 'Could not send the verification code. Please try again.',
        success: false,
      });
    }
  }

  async verifyOtp(req, res) {
    try {
      const email = normalizeEmail(req.body.email);
      const otp = asString(req.body.otp).trim();
      if (!email || !otp) {
        return res.status(400).json({ verified: false, message: 'Error Code: OTP_REQUIRED', code: 'OTP_REQUIRED' });
      }

      const verified = await emailOtpService.verifyOtp(email, otp);
      if (verified) {
        return res.status(200).json({ verified: true, message: 'Email verified successfully' });
      }
      return res.status(400).json({ verified: false, message: 'Error Code: OTP_INVALID', code: 'OTP_INVALID' });
    } catch (error) {
      const isExpired =
        error.code === 'OTP_EXPIRED' || error.status === 410 || /OTP_EXPIRED/.test(error.message || '');
      const statusCode = error.status || (isExpired ? 410 : 400);
      const errorCode = error.code || (isExpired ? 'OTP_EXPIRED' : 'OTP_VERIFICATION_FAILED');
      return res.status(statusCode).json({ verified: false, message: `Error Code: ${errorCode}`, code: errorCode });
    }
  }

  async register(req, res, next) {
    try {
      const username = asString(req.body.username).trim();
      const email = normalizeEmail(req.body.email);
      const { password, firstName, lastName, country, occupationId } = req.body;

      if (!username || !email || !password) {
        throw badRequest('Username, email, and password are required');
      }
      if (!isValidUsername(username)) {
        throw badRequest('Username must be 3-50 characters and use only letters, numbers, dots, dashes or underscores');
      }
      if (!isValidEmail(email)) {
        throw badRequest('Please enter a valid email address');
      }
      assertPassword(password);

      // Email ownership must have been proven with an OTP first.
      const isVerified = await emailOtpService.isEmailVerified(email);
      if (!isVerified) {
        throw badRequest('Email not verified. Please verify your email with OTP first.', 'EMAIL_NOT_VERIFIED');
      }

      if (await authService.existsByUsername(username)) {
        throw badRequest('Username is already taken', 'USERNAME_TAKEN');
      }
      if (await authService.existsByEmail(email)) {
        throw badRequest('Email is already in use', 'EMAIL_TAKEN');
      }

      // SECURITY: the role is never taken from the request. Everyone starts as a normal user;
      // only an owner can promote accounts afterwards.
      const parsedOccupation = Number.parseInt(occupationId, 10);
      const user = await authService.registerUser({
        username,
        email,
        password,
        firstName: asString(firstName).trim().slice(0, 100),
        lastName: asString(lastName).trim().slice(0, 100),
        country: asString(country).trim().slice(0, 100) || undefined,
        role: 'ROLE_USER',
        occupationId: Number.isInteger(parsedOccupation) && parsedOccupation > 0 ? parsedOccupation : null,
      });

      // The verification is single use.
      try {
        await emailOtpRepository.deleteByEmail(email);
      } catch (_) {
        /* best effort */
      }

      return res.status(200).json(buildSessionResponse(user));
    } catch (error) {
      return next(error);
    }
  }

  async verify(req, res) {
    const session = buildSessionResponse(req.user);
    session.token = '';
    return res.status(200).json(session);
  }

  async health(req, res) {
    return res.status(200).send('OK');
  }

  async googleAuth(req, res, next) {
    try {
      const googleToken = asString(req.body.googleToken || req.body.accessToken || req.body.credential);
      if (!googleToken) {
        throw badRequest('Google token is required');
      }

      // The email address is taken from Google's response for this token - never from the request body.
      const profile = await googleAuthService.verifyGoogleToken(googleToken);

      const user = await authService.findOrCreateGoogleUser(
        profile.email,
        profile.firstName || asString(req.body.firstName),
        profile.lastName || asString(req.body.lastName)
      );

      if (isBlocked(user.blocked) && user.role === 'ROLE_USER') {
        return res.status(403).json({ error: 'Your account has been blocked. Please contact support.', code: '403', status: 403 });
      }

      return res.status(200).json(buildSessionResponse(user));
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Owner-only email diagnostics. Never reveals API keys or stack traces.
   */
  async testEmail(req, res) {
    try {
      const targetEmail = normalizeEmail(req.query.to || req.query.email || req.user.email);
      if (!isValidEmail(targetEmail)) {
        return res.status(400).json({ success: false, error: 'A valid "to" address is required' });
      }

      const hasKey = Boolean((process.env.BREVO_API_KEY || '').trim());
      const { sendMail } = require('../config/mailer');
      const sendResult = await sendMail({
        to: targetEmail,
        subject: 'Expense Tracker Email Test',
        text: 'This is a test email from Expense Tracker. Email delivery is working correctly!',
        html: '<div style="font-family: sans-serif; padding: 20px;"><h2>Expense Tracker Email Test</h2><p>Email delivery is working correctly.</p></div>',
      });

      return res.status(200).json({
        success: sendResult.delivered !== false && !sendResult.simulated,
        providerConfigured: hasKey,
        targetEmail,
      });
    } catch (error) {
      console.error('Email test error:', error.message);
      return res.status(500).json({ success: false, error: 'Email test failed. Check server logs.' });
    }
  }

  // Aliases for route flexibility
  async healthCheck(req, res) {
    return this.health(req, res);
  }

  async googleLogin(req, res, next) {
    return this.googleAuth(req, res, next);
  }

  async verifyToken(req, res) {
    return this.verify(req, res);
  }
}

module.exports = new AuthController();
