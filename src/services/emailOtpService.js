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

    // Send email with fallback handling
    // Gmail and Apple Mail recognize "<OTP> is your <SERVICE> verification code" for native "Copy code" detection
    const subject = `${otp} is your Expense Tracker verification code`;
    const text = `Your verification code is: ${otp}\n\nThis verification code will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nUse this 6-digit code to complete your Expense Tracker email verification. Never share this code with anyone.\n\nIf you did not request this verification code, please ignore this email.`;
    const html = this.buildOtpEmailHtml(otp);

    let delivered = false;
    try {
      const mailResult = await sendMail({ to: email, subject, text, html });
      delivered = Boolean(mailResult && mailResult.delivered !== false && !mailResult.simulated);
      console.log(`[EmailOtpService] OTP processed for ${email} (Delivered: ${delivered})`);
    } catch (err) {
      console.warn(`[EmailOtpService] Mail delivery error for ${email}:`, err.message);
      delivered = false;
    }

    return {
      success: true,
      email,
      delivered,
      devOtp: !delivered ? otp : undefined,
    };
  }

  async sendDeleteAccountOtp(ownerEmail, targetUsername) {
    if (!ownerEmail) {
      throw new Error('Owner email is required');
    }

    // Delete old OTPs for this owner email
    await emailOtpRepository.deleteByEmail(ownerEmail);

    // Generate 6-digit OTP
    const otp = this.generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP in database
    await emailOtpRepository.create(ownerEmail, otp, expiresAt);

    // Send email with confirmation code
    const subject = `${otp} is your confirmation code to delete user "${targetUsername}"`;
    const text = `Your security confirmation code is: ${otp}\n\nYou requested to permanently delete user "${targetUsername}". This code expires in ${OTP_EXPIRY_MINUTES} minutes.\n\nNever share this code with anyone. If you did not request this deletion, please secure your account immediately.`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta itemprop="otp" content="${otp}" />
  <title>Confirm Account Deletion</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;border-radius:20px;overflow:hidden;background:#ffffff;box-shadow:0 20px 40px rgba(0,0,0,0.3);">
        <tr><td style="background:#dc2626;padding:32px 28px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:800;letter-spacing:-0.5px;">Confirm Account Deletion</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.9);font-size:13px;font-weight:600;">Expense Tracker Security Action</p>
        </td></tr>
        <tr><td style="padding:32px 28px 24px;">
          <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">
            You requested to permanently delete user: <strong style="color:#0f172a;">${targetUsername}</strong>.
          </p>
          <p style="margin:0 0 12px;color:#475569;font-size:13px;font-weight:600;">Your 6-digit confirmation security code is:</p>
          <div style="background:#fef2f2;border:2px dashed #f87171;border-radius:14px;padding:20px 16px;text-align:center;margin:16px 0 24px;">
            <span style="font-size:38px;font-weight:800;letter-spacing:10px;color:#991b1b;font-family:'Courier New',Courier,monospace;display:inline-block;user-select:all;">${otp}</span>
            <div style="font-size:12px;color:#b91c1c;margin-top:8px;font-weight:600;">&#9201; Expires in ${OTP_EXPIRY_MINUTES} minutes</div>
          </div>
          <div style="background:#fff1f2;border:1px solid #fecdd3;border-radius:12px;padding:12px 16px;margin-bottom:20px;">
            <p style="margin:0;color:#9f1239;font-size:12px;line-height:1.5;">
              &#9888; <strong>Warning:</strong> Deleting an account permanently erases all associated data. Never share this code.
            </p>
          </div>
        </td></tr>
        <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;">
          <p style="margin:0;color:#94a3b8;font-size:12px;">© Expense Tracker • Security Operations</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    let delivered = false;
    try {
      const mailResult = await sendMail({ to: ownerEmail, subject, text, html });
      delivered = Boolean(mailResult && mailResult.delivered !== false && !mailResult.simulated);
      console.log(`[EmailOtpService] Delete OTP processed for ${ownerEmail} (Delivered: ${delivered})`);
    } catch (err) {
      console.warn(`[EmailOtpService] Mail delivery error for ${ownerEmail}:`, err.message);
      delivered = false;
    }

    return {
      success: true,
      email: ownerEmail,
      delivered,
    };
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
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta itemprop="otp" content="${otp}" />
  <title>Your Verification Code</title>
</head>
<body style="margin:0;padding:0;background-color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0f172a;padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;border-radius:24px;overflow:hidden;background:#1e293b;border:1px solid rgba(255,255,255,0.1);box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 50%,#7c3aed 100%);padding:36px 32px;text-align:center;">
          <div style="display:inline-block;width:56px;height:56px;background:rgba(255,255,255,0.18);border-radius:16px;line-height:56px;font-size:26px;color:#ffffff;box-shadow:0 4px 16px rgba(0,0,0,0.15);">
            &#128272;
          </div>
          <h1 style="margin:16px 0 0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">
            Email Verification
          </h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;font-weight:600;">Expense Tracker Security Portal</p>
        </td></tr>

        <!-- Content -->
        <tr><td style="padding:36px 36px 28px;">
          <p style="margin:0 0 6px;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:1px;font-weight:700;">Identity Confirmation</p>
          <h2 style="margin:0 0 16px;color:#f8fafc;font-size:20px;font-weight:700;">Your 6-Digit Verification Code</h2>
          <p style="margin:0 0 24px;color:#cbd5e1;font-size:14px;line-height:1.6;">
            Use the verification code below to verify your email address. You can copy this code and paste it on the verification screen:
          </p>

          <!-- OTP Box (Formatted for Gmail / Apple Mail 'Copy Code' detection) -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr><td align="center" style="background:#0f172a;border:2px dashed #6366f1;border-radius:18px;padding:26px 20px;">
              <div style="font-size:11px;font-weight:700;color:#818cf8;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px;">One-Time Security Code</div>
              <span style="font-size:42px;font-weight:800;letter-spacing:12px;color:#a5b4fc;font-family:'Courier New',Courier,monospace;display:inline-block;user-select:all;">${otp}</span>
              <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;font-weight:600;">
                &#9201; Valid for <strong style="color:#e2e8f0;">${OTP_EXPIRY_MINUTES} minutes</strong>
              </p>
            </td></tr>
          </table>

          <!-- Security Advisory Box -->
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;margin-bottom:20px;">
            <p style="margin:0 0 8px;color:#cbd5e1;font-size:12px;font-weight:700;">&#128274; Security Tips:</p>
            <ul style="margin:0;padding-left:18px;color:#94a3b8;font-size:12px;line-height:1.6;">
              <li>Never share this code with anyone. Expense Tracker staff will never ask for your code.</li>
              <li>This code is single-use and will automatically expire in ${OTP_EXPIRY_MINUTES} minutes.</li>
              <li>If you did not request this verification, no action is needed.</li>
            </ul>
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
}

module.exports = new EmailOtpService();

