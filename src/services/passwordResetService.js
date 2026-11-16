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

    const subject = '[Expense Tracker] Password reset verification code';
    const text = this.buildPasswordResetEmailText(firstName, otp, user.email, frontendUrl);
    const html = this.buildPasswordResetEmailHtml(firstName, otp, user.email, frontendUrl);

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

  buildPasswordResetEmailHtml(firstName, otp, email, frontendUrl) {
    const autofillUrl = frontendUrl ? `${frontendUrl}/forgot-password?identifier=${encodeURIComponent(email || '')}&code=${otp}` : '';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta itemprop="otp" content="${otp}" />
  <title>Reset your password</title>
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "EmailMessage",
    "description": "Your password reset verification code is ${otp}"
  }
  </script>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111827;">
  <!-- Hidden preheader preview for email clients -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    Your one-time verification code is ${otp}. Use this code to reset your password.
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #e5e7eb; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
          <!-- Brand Logo Header -->
          <tr>
            <td align="center" style="padding: 36px 32px 16px; border-bottom: 1px solid #f3f4f6;">
              <span style="font-size: 26px; font-weight: 800; color: #059669; letter-spacing: -0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                Expense Tracker
              </span>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding: 36px 36px 28px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #111827; text-align: center;">
                Reset your password
              </h1>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #374151;">
                Hi${firstName ? ' ' + firstName : ''},
              </p>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                We received a request to reset the password for your Expense Tracker account. Enter the following one-time verification code:
              </p>

              <!-- OTP Display Box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px 0 14px;">
                <tr>
                  <td align="center">
                    <p style="margin: 0 0 8px; font-size: 12px; font-weight: 600; color: #059669; text-transform: uppercase; letter-spacing: 0.5px;">
                      &#128073; Click or tap code to select &amp; copy
                    </p>
                    <div style="display: inline-block; background-color: #f3f4f6; border: 2px dashed #059669; border-radius: 12px; padding: 16px 36px; text-align: center;">
                      <code style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #111827; display: inline-block; user-select: all; -webkit-user-select: all; cursor: pointer;">
                        ${otp}
                      </code>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Copy & Auto-Fill One-Tap Button -->
              ${autofillUrl ? `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 24px;">
                <tr>
                  <td align="center">
                    <a href="${autofillUrl}"
                       target="_blank"
                       style="display: inline-block; background-color: #059669; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 13px 32px; border-radius: 10px; box-shadow: 0 4px 10px rgba(5,150,105,0.25); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                      &#128203; Copy &amp; Auto-Fill Code
                    </a>
                  </td>
                </tr>
              </table>` : ''}

              <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; text-align: center;">
                This verification code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>

              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #4b5563;">
                If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
              </p>

              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                Never share this verification code with anyone. Expense Tracker team will never ask for it.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-top: 1px solid #f3f4f6; padding: 24px 36px; text-align: center;">
              <p style="margin: 0 0 4px; font-size: 12px; font-weight: 600; color: #6b7280;">
                Expense Tracker • Smart Financial Management
              </p>
              <p style="margin: 0; font-size: 11px; color: #9ca3af;">
                This is an automated security notification.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  buildPasswordResetEmailText(firstName, otp, email, frontendUrl) {
    const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
    const linkSection = frontendUrl ? `\n\nOr click here to copy & auto-fill the code automatically:\n${frontendUrl}/forgot-password?identifier=${encodeURIComponent(email || '')}&code=${otp}` : '';
    return `${greeting}\n\nWe received a request to reset your password for your Expense Tracker account.\n\nEnter the following one-time verification code:\n\n${otp}\n\nThis verification code will expire in ${OTP_EXPIRY_MINUTES} minutes.${linkSection}\n\nIf you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.\n\nBest regards,\nExpense Tracker Team`;
  }
}

module.exports = new PasswordResetService();
