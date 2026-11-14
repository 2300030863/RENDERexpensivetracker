const passwordResetService = require('../services/passwordResetService');

class PasswordResetController {
  async forgotPassword(req, res, next) {
    try {
      const identifier = (req.body.identifier || req.body.email || req.body.username || '').trim();
      if (!identifier) {
        return res.status(400).json({ error: 'Username or email is required' });
      }

      const result = await passwordResetService.createPasswordResetTokenAndOtp(identifier);

      return res.status(200).json({
        success: true,
        message: result.delivered
          ? 'Verification code sent to your registered email'
          : 'Verification code generated for your account',
        email: result.email,
        username: result.username,
        delivered: result.delivered,
        devOtp: result.devOtp,
      });
    } catch (error) {
      if (error.message === 'User not found') {
        return res.status(404).json({
          error: 'User was not found. Please check your username or email.',
        });
      }
      if (error.message && error.message.includes('Failed to send password reset email')) {
        return res.status(500).json({
          error: 'Unable to send email. Please check your email configuration or try again later.',
        });
      }
      return res.status(500).json({
        error: error.message || 'Failed to process password reset request',
      });
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { token, otp, email, identifier, newPassword } = req.body;
      if (!newPassword) {
        return res.status(400).json({ error: 'New password is required' });
      }

      if (otp && (email || identifier)) {
        await passwordResetService.resetPasswordWithOtp(email || identifier, otp, newPassword);
        return res.status(200).json({
          success: true,
          message: 'Password has been reset successfully',
        });
      }

      if (token) {
        await passwordResetService.resetPassword(token, newPassword);
        return res.status(200).json({
          success: true,
          message: 'Password has been reset successfully',
        });
      }

      return res.status(400).json({ error: 'Reset token or verification code (OTP) with email is required' });
    } catch (error) {
      return res.status(400).json({
        error: error.message,
      });
    }
  }

  async validateToken(req, res, next) {
    try {
      const token = req.query.token || req.params.token || req.body?.token;
      if (!token) {
        return res.status(400).json({ error: 'Token is required' });
      }

      const isValid = await passwordResetService.validatePasswordResetToken(token);
      return res.status(200).json({ valid: isValid });
    } catch (error) {
      return res.status(400).json({ valid: false, error: error.message });
    }
  }
}

module.exports = new PasswordResetController();
