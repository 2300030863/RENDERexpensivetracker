const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const mailHost = process.env.MAIL_HOST || 'smtp.gmail.com';
const mailPort = parseInt(process.env.MAIL_PORT || '587', 10);
const mailUser = process.env.MAIL_USERNAME || 'siveshkommalapati167@gmail.com';
const mailPass = process.env.MAIL_PASSWORD || '';
const mailFrom = process.env.MAIL_FROM || mailUser;
const mailSenderName = process.env.MAIL_SENDER_NAME || 'Expense Tracker';

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: mailHost,
      port: mailPort,
      secure: mailPort === 465,
      auth: mailUser && mailPass ? {
        user: mailUser,
        pass: mailPass,
      } : undefined,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return transporter;
}

/**
 * Send email using Brevo REST API (HTTPS POST)
 * Works reliably across cloud hosts (Render, Docker, etc.) without SMTP port blocking.
 */
async function sendViaEmailApi(apiKey, { to, subject, text, html }) {
  const senderEmail = mailFrom || mailUser;

  const payload = {
    sender: { name: mailSenderName, email: senderEmail },
    to: [{ email: to }],
    subject,
    htmlContent: html || `<div style="font-family: sans-serif; white-space: pre-wrap;">${text}</div>`,
  };

  if (text) {
    payload.textContent = text;
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Mailer API Error] API responded with status ${response.status}:`, errorText);
    throw new Error(`Email delivery failed via API (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Mailer API] Email successfully sent to ${to} via Email API (MessageId: ${data.messageId || 'ok'})`);
  return { success: true, messageId: data.messageId, provider: 'email-api' };
}

/**
 * Centralized email sending function for:
 * - Forgot Password reset links
 * - Email OTP registration verification
 * - Owner/Admin announcements & notifications
 */
async function sendMail({ to, subject, text, html }) {
  const apiKey = (process.env.BREVO_API_KEY || process.env.BRAVE_API_KEY || '').trim();

  // 1. If Brevo / Brave API Key is provided, use high-reliability HTTP REST API
  if (apiKey) {
    console.log(`[Mailer] Dispatching email to ${to} via Email API...`);
    return await sendViaEmailApi(apiKey, { to, subject, text, html });
  }

  // 2. Fallback to Nodemailer SMTP if SMTP password is configured
  if (mailPass) {
    console.log(`[Mailer] Dispatching email to ${to} via SMTP (${mailHost}:${mailPort})...`);
    const transport = getTransporter();
    const mailOptions = {
      from: `"${mailSenderName}" <${mailFrom}>`,
      to,
      subject,
      text,
      html,
    };
    return await transport.sendMail(mailOptions);
  }

  // 3. Fallback to simulation mode if neither is configured
  console.warn(`[Mailer] No Email API key (BREVO_API_KEY/BRAVE_API_KEY) or MAIL_PASSWORD configured. Email to ${to} with subject "${subject}" was skipped.`);
  console.log(`[Mailer Preview] Text Content:\n${text}`);
  return { skipped: true, messageId: 'simulated-' + Date.now() };
}

module.exports = {
  getTransporter,
  sendMail,
  mailFrom,
};

