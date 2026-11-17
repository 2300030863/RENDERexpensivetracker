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
        expiresAt: result.expiresAt,
        expiresAtTimestamp: result.expiresAtTimestamp,
        expirySeconds: result.expirySeconds,
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
        return res.status(400).json({ error: 'Error Code: PASSWORD_REQUIRED', code: 'PASSWORD_REQUIRED' });
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

      return res.status(400).json({ error: 'Error Code: OTP_REQUIRED', code: 'OTP_REQUIRED' });
    } catch (error) {
      const isExpired = error.code === 'OTP_EXPIRED' || 
                        error.code === 'TOKEN_EXPIRED' || 
                        error.status === 410 || 
                        (error.message && (error.message.includes('OTP_EXPIRED') || error.message.includes('expired')));
      const statusCode = error.status || (isExpired ? 410 : 400);
      const errorCode = error.code || (isExpired ? 'OTP_EXPIRED' : 'PASSWORD_RESET_FAILED');
      return res.status(statusCode).json({
        error: error.message || `Error Code: ${errorCode}`,
        code: errorCode,
      });
    }
  }

  async validateToken(req, res, next) {
    try {
      const token = req.query.token || req.params.token || req.body?.token;
      if (!token) {
        return res.status(400).json({ error: 'Error Code: TOKEN_REQUIRED', code: 'TOKEN_REQUIRED' });
      }

      const isValid = await passwordResetService.validatePasswordResetToken(token);
      return res.status(200).json({ valid: isValid });
    } catch (error) {
      return res.status(400).json({ valid: false, error: error.message || 'Error Code: TOKEN_INVALID', code: 'TOKEN_INVALID' });
    }
  }

  async getOtpStatus(req, res, next) {
    try {
      const identifier = (req.query.identifier || req.query.email || req.query.username || '').trim();
      if (!identifier) {
        return res.status(400).json({ active: false, expired: true, remainingSeconds: 0, code: 'OTP_EXPIRED', error: 'Error Code: OTP_EXPIRED' });
      }

      const status = await passwordResetService.getOtpStatus(identifier);
      const statusCode = status.expired ? 410 : 200;
      return res.status(statusCode).json(status);
    } catch (error) {
      return res.status(410).json({ active: false, expired: true, remainingSeconds: 0, code: 'OTP_EXPIRED', error: 'Error Code: OTP_EXPIRED' });
    }
  }
}

module.exports = new PasswordResetController();
