const emailOtpRepository = require('../repositories/emailOtpRepository');
const userRepository = require('../repositories/userRepository');
const { sendMail } = require('../config/mailer');

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

class EmailOtpService {
  generateOtp() {
    let otp = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
      otp += Math.floor(Math.random() * 10);
    }
    return otp;
  }

  async sendOtp(email) {
    // Check if email is already registered
    const exists = await userRepository.existsByEmail(email);
    if (exists) {
      throw new Error('Email is already registered');
    }

    // Delete old OTPs for this email
    await emailOtpRepository.deleteByEmail(email);

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in database
    await emailOtpRepository.create(email, otp, expiresAt);

    // Send email
    const subject = 'Verify Your Email – Expense Tracker';
    const text = `Your verification code is: ${otp}\n\nThis code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nIf you didn't request this, please ignore this email.`;
    const html = this.buildOtpEmailHtml(otp);

    await sendMail({ to: email, subject, text, html });
    console.log(`[EmailOtpService] OTP sent to: ${email}`);
  }

  async verifyOtp(email, otp) {
    const record = await emailOtpRepository.findLatestUnverifiedByEmail(email);
    if (!record) {
      console.warn(`[EmailOtpService] No OTP found for email: ${email}`);
      throw new Error('No verification code found. Please request a new code.');
    }

    // Check attempts limit (max 5)
    if (record.attempts && record.attempts >= MAX_ATTEMPTS) {
      console.warn(`[EmailOtpService] Too many failed attempts for email: ${email}`);
      throw new Error('Too many failed attempts. This verification code has been locked. Please request a new code.');
    }

    // Check expiry (5 minutes)
    const expiry = new Date(record.expires_at).getTime();
    if (Date.now() > expiry) {
      console.warn(`[EmailOtpService] OTP expired for email: ${email}`);
      throw new Error('Verification code has expired (5-minute limit). Please request a new code.');
    }

    // Check match
    if (record.otp !== otp.trim()) {
      await emailOtpRepository.incrementAttempts(record.id);
      const remaining = MAX_ATTEMPTS - ((record.attempts || 0) + 1);
      if (remaining <= 0) {
        throw new Error('Too many incorrect attempts. This code is now invalid. Please request a new code.');
      }
      console.warn(`[EmailOtpService] Invalid OTP for email: ${email}, remaining: ${remaining}`);
      throw new Error(`Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`);
    }

    // Mark as verified
    await emailOtpRepository.markVerified(record.id);
    console.log(`[EmailOtpService] OTP verified successfully for email: ${email}`);
    return true;
  }

  async isEmailVerified(email) {
    const record = await emailOtpRepository.findLatestVerifiedByEmail(email);
    return !!record;
  }

  buildOtpEmailHtml(otp) {
    return `<!DOCTYPE html>
<html>
<head><meta charset='UTF-8'></head>
<body style='margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f7;'>
  <div style='max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>
    <div style='background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:32px 24px;text-align:center;'>
      <h1 style='color:#ffffff;margin:0;font-size:24px;font-weight:700;'>Email Verification</h1>
      <p style='color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;'>Expense Tracker</p>
    </div>
    <div style='padding:32px 24px;text-align:center;'>
      <p style='color:#374151;font-size:16px;margin:0 0 24px;'>Enter this code to verify your email address:</p>
      <div style='display:inline-block;background:#f8f9fa;border-radius:12px;padding:16px 24px;margin:0 0 24px;'>
        <span style='font-size:36px;font-weight:800;letter-spacing:8px;color:#1f2937;font-family:monospace;'>${otp}</span>
      </div>
      <p style='color:#6b7280;font-size:14px;margin:0 0 8px;'>This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.</p>
      <p style='color:#9ca3af;font-size:13px;margin:0;'>If you didn't request this, please ignore this email.</p>
    </div>
    <div style='background:#f8f9fa;padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb;'>
      <p style='color:#9ca3af;font-size:12px;margin:0;'>© Expense Tracker. All rights reserved.</p>
    </div>
  </div>
</body>
</html>`;
  }
}

module.exports = new EmailOtpService();

