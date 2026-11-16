const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const userRepository = require('../repositories/userRepository');
const passwordResetTokenRepository = require('../repositories/passwordResetTokenRepository');
const emailOtpRepository = require('../repositories/emailOtpRepository');
const { sendMail } = require('../config/mailer');

const EXPIRATION_HOURS = 24;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

class PasswordResetService {
  generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createPasswordResetTokenAndOtp(identifier) {
    if (!identifier) {
      throw new Error('User not found');
    }

    const trimmed = identifier.trim();
    let user = await userRepository.findByUsernameOrEmail(trimmed);
    if (!user) {
      user = await userRepository.findByEmail(trimmed);
    }
    if (!user) {
      user = await userRepository.findByUsername(trimmed);
    }

    if (!user) {
      console.warn(`[PasswordResetService] User not found for identifier: ${identifier}`);
      throw new Error('User not found');
    }

    // 1. Delete previous OTPs for this email and generate a fresh 6-digit OTP
    await emailOtpRepository.deleteByEmail(user.email);
    const otp = this.generateOtp();
    const otpExpiryDate = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
    await emailOtpRepository.create(user.email, otp, otpExpiryDate);

    // 2. Also create reset token in case the user prefers clicking the email link
    await passwordResetTokenRepository.deleteByUserId(user.id);
    const token = uuidv4();
    const tokenExpiryDate = new Date(Date.now() + EXPIRATION_HOURS * 60 * 60 * 1000);
    await passwordResetTokenRepository.create(token, user.id, tokenExpiryDate);

    // 3. Send email with OTP prominently displayed and reset link
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    const firstName = user.first_name || user.username || 'User';

    const subject = `${otp} is your Expense Tracker password reset code`;
    const text = this.buildPasswordResetEmailText(firstName, otp);
    const html = this.buildPasswordResetEmailHtml(firstName, otp);

    let delivered = false;
    try {
      const mailResult = await sendMail({ to: user.email, subject, text, html });
      delivered = Boolean(mailResult && mailResult.delivered !== false && !mailResult.simulated);
      console.log(`[PasswordResetService] Password reset OTP processed for: ${user.email} (Delivered: ${delivered})`);
    } catch (err) {
      console.error(`[PasswordResetService] Failed to send email to ${user.email}:`, err.message);
      delivered = false;
    }

    return {
      success: true,
      email: user.email,
      username: user.username,
      delivered,
      devOtp: !delivered ? otp : undefined,
    };
  }

  // Alias for backward compatibility if called directly
  async createPasswordResetToken(identifier) {
    return await this.createPasswordResetTokenAndOtp(identifier);
  }

  async resetPasswordWithOtp(emailOrIdentifier, otp, newPassword) {
    if (!emailOrIdentifier || !otp || !newPassword) {
      throw new Error('Email/Username, OTP, and new password are required');
    }

    const trimmedIdentifier = emailOrIdentifier.trim();
    let user = await userRepository.findByUsernameOrEmail(trimmedIdentifier);
    if (!user) {
      user = await userRepository.findByEmail(trimmedIdentifier);
    }
    if (!user) {
      user = await userRepository.findByUsername(trimmedIdentifier);
    }

    if (!user) {
      throw new Error('User not found');
    }

    const record = await emailOtpRepository.findLatestUnverifiedByEmail(user.email);
    if (!record) {
      throw new Error('No valid OTP code found. Please request a new code.');
    }

    // Check attempts limit (max 5)
    if (record.attempts && record.attempts >= MAX_ATTEMPTS) {
      throw new Error('Too many failed attempts. This verification code has been locked. Please request a new code.');
    }

    // Check expiry (5 minutes)
    const expiry = new Date(record.expires_at).getTime();
    if (Date.now() > expiry) {
      throw new Error('Verification code has expired (5-minute limit). Please request a new code.');
    }

    // Check match
    if (record.otp !== otp.toString().trim()) {
      await emailOtpRepository.incrementAttempts(record.id);
      const remaining = MAX_ATTEMPTS - ((record.attempts || 0) + 1);
      if (remaining <= 0) {
        throw new Error('Too many incorrect attempts. This code is now invalid. Please request a new code.');
      }
      throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Hash new password and update user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await userRepository.update(user.id, { password: hashedPassword });
    await emailOtpRepository.markVerified(record.id);
    await passwordResetTokenRepository.deleteByUserId(user.id);

    console.log(`[PasswordResetService] Password successfully reset with OTP for user: ${user.username} (${user.email})`);
    return { success: true };
  }

  async resetPassword(token, newPassword) {
    const resetToken = await passwordResetTokenRepository.findByToken(token);
    if (!resetToken) {
      throw new Error('Invalid password reset token');
    }

    if (resetToken.used) {
      throw new Error('This password reset token has already been used');
    }

    const expiry = new Date(resetToken.expiry_date).getTime();
    if (Date.now() > expiry) {
      throw new Error('This password reset token has expired');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    await userRepository.update(resetToken.user_id, { password: hashedPassword });
    await passwordResetTokenRepository.markUsed(resetToken.id);
  }

  async validatePasswordResetToken(token) {
    const resetToken = await passwordResetTokenRepository.findByToken(token);
    if (!resetToken) return false;
    if (resetToken.used) return false;
    const expiry = new Date(resetToken.expiry_date).getTime();
    return Date.now() <= expiry;
  }

  buildPasswordResetEmailHtml(firstName, otp) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta itemprop="otp" content="${otp}" />
  <title>Reset Your Password</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;border-radius:24px;overflow:hidden;background:#1e293b;border:1px solid rgba(255,255,255,0.1);box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <!-- Header Banner -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#7c3aed 50%,#9333ea 100%);padding:36px 32px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.2);border-radius:16px;line-height:56px;font-size:26px;color:#ffffff;box-shadow:0 4px 12px rgba(0,0,0,0.15);">
            &#128274;
          </div>
          <h1 style="margin:16px 0 0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
            Password Reset Code
          </h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:500;">Expense Tracker Security Portal</p>
        </td></tr>

        <!-- Main Body -->
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 4px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Account Recovery</p>
          <h2 style="margin:0 0 16px;color:#f8fafc;font-size:20px;font-weight:700;">Hello, ${firstName}</h2>
          <p style="margin:0 0 24px;color:#cbd5e1;font-size:14px;line-height:1.6;">
            We received a request to reset your password. Enter the 6-digit verification code below on the password recovery screen:
          </p>

          <!-- OTP Box -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center" style="background:#0f172a;border:2px solid #6366f1;border-radius:18px;padding:24px 20px;">
              <span style="font-size:38px;font-weight:800;letter-spacing:10px;color:#a5b4fc;font-family:'Courier New',Courier,monospace;display:inline-block;">${otp}</span>
              <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;font-weight:600;">
                &#9201; This code expires in <strong style="color:#e2e8f0;">${OTP_EXPIRY_MINUTES} minutes</strong>
              </p>
            </td></tr>
          </table>

          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:12px 16px;margin-bottom:20px;">
            <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.5;">
              &#9888; If you did not request a password reset, please ignore this email. Your password will remain unchanged.
            </p>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#0f172a;border-top:1px solid rgba(255,255,255,0.06);padding:20px 36px;text-align:center;">
          <p style="margin:0;color:#64748b;font-size:12px;">© Expense Tracker • Secure Account Services</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
  }

  buildPasswordResetEmailText(firstName, otp) {
    return `Hello ${firstName},\n\nWe received a request to reset your password for Expense Tracker.\n\nYour 6-digit verification code is: ${otp}\n(This code expires in ${OTP_EXPIRY_MINUTES} minutes)\n\nEnter this verification code on the password recovery screen to reset your password.\n\nIf you did not request this, please ignore this email.\n\nBest regards,\nExpense Tracker Team`;
  }
}

module.exports = new PasswordResetService();
