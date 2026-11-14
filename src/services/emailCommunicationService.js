const userRepository = require('../repositories/userRepository');
const { sendMail } = require('../config/mailer');

class EmailCommunicationService {
  async sendEmailToUsers(recipientIds, subject, messageText, senderName) {
    let sentCount = 0;
    const failedRecipients = [];

    for (const userId of recipientIds) {
      const user = await userRepository.findById(userId);
      if (user && user.email) {
        try {
          await this.sendSingleEmail(user, subject, messageText, senderName);
          sentCount++;
        } catch (err) {
          failedRecipients.push(user.email);
          console.error(`[EmailCommunicationService] Failed to send email to: ${user.email} - ${err.message}`);
        }
      }
    }

    if (failedRecipients.length > 0) {
      console.warn(`[EmailCommunicationService] Failed recipients: ${failedRecipients.join(', ')}`);
    }

    return sentCount;
  }

  async sendEmailToAllByRole(roleString, subject, messageText, senderName) {
    const users = await userRepository.findByRole(roleString);
    let sentCount = 0;

    for (const user of users) {
      if (user.email) {
        try {
          await this.sendSingleEmail(user, subject, messageText, senderName);
          sentCount++;
        } catch (err) {
          console.error(`[EmailCommunicationService] Failed to send email to: ${user.email} - ${err.message}`);
        }
      }
    }

    return sentCount;
  }

  async sendSingleEmail(user, subject, messageText, senderName) {
    const text = `Hello ${user.first_name || user.username},\n\n${messageText}\n\n---\nThis message was sent by: ${senderName} (System Owner)\nExpense Tracker System\n\nThis email was sent to your registered email address: ${user.email}`;

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2>Hello ${user.first_name || user.username},</h2>
        <p style="white-space: pre-wrap; font-size: 15px; line-height: 1.6;">${messageText}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">This message was sent by: <strong>${senderName}</strong> (System Owner)<br/>Expense Tracker System</p>
        <p style="color: #999; font-size: 11px;">This email was sent to your registered email address: ${user.email}</p>
      </div>
    `;

    return await sendMail({
      to: user.email,
      subject,
      text,
      html,
    });
  }
}

module.exports = new EmailCommunicationService();

