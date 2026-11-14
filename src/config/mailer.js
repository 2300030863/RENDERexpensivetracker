const dotenv = require('dotenv');

dotenv.config();

const mailFrom = process.env.MAIL_FROM || 'siveshkommalapati167@gmail.com';
const mailSenderName = process.env.MAIL_SENDER_NAME || 'Expense Tracker';

/**
 * Send email using Brevo REST API v3 (HTTPS POST - No SMTP)
 * Directly uses BREVO_API_KEY over HTTPS without opening SMTP ports or using SMTP credentials.
 */
async function sendViaBrevoApi(apiKey, { to, subject, text, html }) {
  const cleanKey = apiKey.trim();
  let senderEmail = (process.env.MAIL_FROM || mailFrom).trim();

  const buildPayload = (fromEmail) => {
    const payload = {
      sender: { name: mailSenderName, email: fromEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html || `<div style="font-family: sans-serif; white-space: pre-wrap;">${text}</div>`,
    };
    if (text) {
      payload.textContent = text;
    }
    return payload;
  };

  let response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'api-key': cleanKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify(buildPayload(senderEmail)),
  });

  // If initial attempt fails due to sender verification, auto-detect verified sender from Brevo account
  if (!response.ok && (response.status === 400 || response.status === 403)) {
    const errorText = await response.text();
    console.warn(`[Mailer Brevo] Initial attempt with sender <${senderEmail}> failed: ${errorText}`);

    if (
      errorText.toLowerCase().includes('sender') ||
      errorText.toLowerCase().includes('not verified') ||
      errorText.toLowerCase().includes('unauthorized')
    ) {
      try {
        console.log('[Mailer Brevo] Querying active verified senders from Brevo account...');
        const sendersRes = await fetch('https://api.brevo.com/v3/senders', {
          headers: {
            'accept': 'application/json',
            'api-key': cleanKey,
          },
        });
        if (sendersRes.ok) {
          const sendersData = await sendersRes.json();
          const verifiedSender = sendersData.senders?.find((s) => s.active && s.email);
          if (verifiedSender && verifiedSender.email !== senderEmail) {
            console.log(`[Mailer Brevo] Found verified sender: ${verifiedSender.email}. Retrying dispatch...`);
            senderEmail = verifiedSender.email;
            response = await fetch('https://api.brevo.com/v3/smtp/email', {
              method: 'POST',
              headers: {
                'accept': 'application/json',
                'api-key': cleanKey,
                'content-type': 'application/json',
              },
              body: JSON.stringify(buildPayload(senderEmail)),
            });
          }
        }
      } catch (lookupErr) {
        console.warn('[Mailer Brevo] Could not fetch senders list:', lookupErr.message);
      }
    }

    if (!response.ok) {
      const finalError = await response.text();
      throw new Error(`Brevo API returned status ${response.status}: ${finalError}`);
    }
  } else if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Brevo API returned status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  console.log(`[Mailer Brevo] Successfully delivered email to ${to} (MessageId: ${data.messageId || 'ok'}, Sender: ${senderEmail})`);
  return { success: true, delivered: true, messageId: data.messageId, provider: 'brevo-api', sender: senderEmail };
}

/**
 * Centralized email sending function (Pure HTTP REST API - No SMTP)
 * - Forgot Password reset OTPs & links
 * - Registration verification OTPs
 * - Owner/Admin announcements & notifications
 */
async function sendMail({ to, subject, text, html }) {
  const brevoKey = (process.env.BREVO_API_KEY || process.env.BRAVE_API_KEY || '').trim();

  if (brevoKey) {
    try {
      console.log(`[Mailer] Dispatching email to ${to} via Brevo REST API...`);
      return await sendViaBrevoApi(brevoKey, { to, subject, text, html });
    } catch (err) {
      console.warn(`[Mailer Brevo Error] ${err.message}`);
      // Fallback mode so user is never locked out with 500 error
      return {
        success: true,
        delivered: false,
        simulated: true,
        reason: err.message,
        messageId: 'simulated-' + Date.now(),
      };
    }
  }

  console.warn(`[Mailer] No BREVO_API_KEY found in environment variables. Email to ${to} skipped.`);
  console.log(`[Mailer Preview] Dispatching to ${to} -> Subject: "${subject}"\n${text}`);

  return {
    success: true,
    delivered: false,
    simulated: true,
    reason: 'BREVO_API_KEY is not configured',
    messageId: 'simulated-' + Date.now(),
  };
}

module.exports = {
  sendMail,
  mailFrom,
};
