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
    // Standard subject and phrasing to trigger Gmail / Apple Mail native "Code Requested / Copy code" action card
    const subject = '[Expense Tracker] Verify your email address';
    const text = `Hi,\n\nThank you for signing up with Expense Tracker.\n\nTo verify your email address, use the following one-time verification code:\n\n${otp}\n\nThis verification code will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nNever share this verification code with anyone. If you did not request this code, please ignore this email.\n\nBest regards,\nExpense Tracker Team`;
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
    const subject = '[Expense Tracker] Account deletion verification code';
    const text = `Hi Owner,\n\nYou requested to permanently delete user account "${targetUsername}".\n\nUse the following one-time verification code to confirm deletion:\n\n${otp}\n\nThis verification code will expire in ${OTP_EXPIRY_MINUTES} minutes.\n\nWarning: Account deletion is permanent and cannot be undone. If you did not request this deletion, secure your account immediately.\n\nBest regards,\nExpense Tracker Team`;
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta itemprop="otp" content="${otp}" />
  <title>Confirm Account Deletion</title>
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "EmailMessage",
    "description": "Your account deletion confirmation code is ${otp}"
  }
  </script>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111827;">
  <!-- Hidden preheader preview for email clients -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    Your one-time deletion code is ${otp}.
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color: #f9fafb; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" role="presentation" style="max-width: 560px; width: 100%; background-color: #ffffff; border: 1px solid #fee2e2; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding: 32px 32px 16px; border-bottom: 1px solid #fef2f2;">
              <span style="font-size: 24px; font-weight: 800; color: #dc2626; letter-spacing: -0.5px;">
                Expense Tracker
              </span>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 36px 36px 28px;">
              <h1 style="margin: 0 0 16px; font-size: 22px; font-weight: 700; color: #991b1b; text-align: center;">
                Confirm Account Deletion
              </h1>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #374151;">
                Hi Owner,
              </p>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                You requested to permanently delete the user account: <strong style="color: #111827;">${targetUsername}</strong>. To proceed, use the following one-time verification code:
              </p>

              <!-- OTP Display Box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #991b1b; display: inline-block; user-select: all;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; text-align: center;">
                This verification code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>

              <div style="background-color: #fff1f2; border: 1px solid #fecdd3; border-radius: 10px; padding: 14px 18px; margin-bottom: 20px;">
                <p style="margin: 0; color: #9f1239; font-size: 13px; line-height: 1.5;">
                  <strong>Warning:</strong> Deleting an account is permanent and irreversible. All associated data will be erased immediately.
                </p>
              </div>

              <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                If you did not request this deletion, please secure your account immediately.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; border-top: 1px solid #f3f4f6; padding: 24px 36px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                Expense Tracker • Security Operations
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
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
  <title>Verify your email address</title>
  <script type="application/ld+json">
  {
    "@context": "http://schema.org",
    "@type": "EmailMessage",
    "description": "Your email verification code is ${otp}"
  }
  </script>
</head>
<body style="margin: 0; padding: 0; background-color: #f9fafb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased; color: #111827;">
  <!-- Hidden preheader preview for email clients -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    Your one-time verification code is ${otp}. Use this code to verify your email address.
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
                Verify your email address
              </h1>

              <p style="margin: 0 0 16px; font-size: 15px; line-height: 1.6; color: #374151;">
                Hi,
              </p>

              <p style="margin: 0 0 20px; font-size: 15px; line-height: 1.6; color: #374151;">
                Thank you for creating an account with Expense Tracker. To complete your registration, use the following one-time verification code:
              </p>

              <!-- OTP Display Box -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px 0;">
                <tr>
                  <td align="center">
                    <div style="display: inline-block; background-color: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 12px; padding: 18px 36px; text-align: center;">
                      <span style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: #111827; display: inline-block; user-select: all;">
                        ${otp}
                      </span>
                    </div>
                  </td>
                </tr>
              </table>

              <p style="margin: 0 0 24px; font-size: 13px; color: #6b7280; text-align: center;">
                This verification code will expire in <strong>${OTP_EXPIRY_MINUTES} minutes</strong>.
              </p>

              <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.6; color: #4b5563;">
                If you didn't create an account with Expense Tracker, you can safely ignore this email.
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
}

module.exports = new EmailOtpService();

