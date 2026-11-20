package com.expensetracker.service;

import com.expensetracker.entity.PasswordResetToken;
import com.expensetracker.entity.User;
import com.expensetracker.repository.PasswordResetTokenRepository;
import com.expensetracker.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.mail.MessagingException;
import javax.mail.internet.MimeMessage;

import java.time.LocalDateTime;
import java.util.Objects;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;


@Service
@Transactional
public class PasswordResetService {
    
    private static final Logger logger = LoggerFactory.getLogger(PasswordResetService.class);

    
    @Autowired
    private UserRepository userRepository;
    
    @Autowired
    private PasswordResetTokenRepository tokenRepository;
    
    @Autowired
    private JavaMailSender mailSender;
    
    @Autowired
    private PasswordEncoder passwordEncoder;
    
    @Value("${app.email.from:siveshkommalapati167@gmail.com}")
    private String fromEmail;

    @Value("${app.frontend.url:http://localhost:5173}")
    private String frontendUrl;

    private static final int EXPIRATION_HOURS = 24;
    
    public void createPasswordResetToken(String identifier) {
        // SECURITY: Find user by username OR email
        // The reset link will ONLY be sent to the email address stored in the database
        // from when the account was created (user.getEmail())
        User user = null;
        
        // Try to find by email first
        user = userRepository.findByEmail(identifier).orElse(null);
        
        // If not found by email, try to find by username
        if (user == null) {
            user = userRepository.findByUsername(identifier).orElse(null);
        }
        
        if (user != null) {
            // Delete any existing tokens for this user
            tokenRepository.deleteByUser(user);
            
            // Generate new token
            String token = UUID.randomUUID().toString();
            LocalDateTime expiryDate = LocalDateTime.now().plusHours(EXPIRATION_HOURS);
            
            PasswordResetToken resetToken = new PasswordResetToken(token, user, expiryDate);
            tokenRepository.save(resetToken);
            
            // CRITICAL: Send email ONLY to user.getEmail() - the registered email from database
            // User entered username or email, but reset link ALWAYS goes to registered email
            try {
                sendPasswordResetEmail(user, token);
                logger.info("Password reset email sent successfully to: {}", user.getEmail());
            } catch (Exception e) {
                logger.error("FAILED to send password reset email to: {} | Error: {}", user.getEmail(), e.getMessage(), e);
                throw new RuntimeException("Failed to send password reset email. Please try again later.");
            }
        } else {
            logger.warn("Password reset requested for non-existent account: {}", identifier);
        }
        // If user doesn't exist, silently succeed (security best practice)
        // This prevents attackers from discovering which accounts are registered
    }
    
    private void sendPasswordResetEmail(User user, String token) {
        String resetUrl = frontendUrl + "/reset-password?token=" + token;

        // Null-safe locals — satisfies @NonNull checks on MimeMessageHelper methods
        String safeFrom      = Objects.requireNonNullElse(fromEmail,        "");
        String safeTo        = Objects.requireNonNullElse(user.getEmail(),   "");
        String safeFirstName = Objects.requireNonNullElse(user.getFirstName(), "User");

        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            helper.setFrom(safeFrom);
            // CRITICAL SECURITY: Email is sent ONLY to user.getEmail() which is the 
            // email address stored in the database when the account was created.
            // This value comes from the User entity, NOT from any user input.
            helper.setTo(safeTo);
            helper.setSubject("Reset Your Password \u2013 Expense Tracker");

            // Set both plain-text and HTML in one call (multipart/alternative)
            String plainText = Objects.requireNonNullElse(buildPasswordResetEmailText(safeFirstName, resetUrl), "");
            String htmlText  = Objects.requireNonNullElse(buildPasswordResetEmailHtml(safeFirstName, resetUrl), "");
            helper.setText(plainText, htmlText);

            mailSender.send(mimeMessage);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to build email message", e);
        }

    }

    private String buildPasswordResetEmailHtml(String firstName, String resetUrl) {
        return "<!DOCTYPE html>" +
            "<html lang=\"en\">" +
            "<head>" +
            "  <meta charset=\"UTF-8\" />" +
            "  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />" +
            "  <title>Reset Your Password</title>" +
            "</head>" +
            "<body style=\"margin:0;padding:0;background-color:#0f0f1a;font-family:'Segoe UI',Arial,sans-serif;\">" +
            "  <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background-color:#0f0f1a;padding:40px 16px;\">" +
            "    <tr><td align=\"center\">" +
            "      <table width=\"580\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:580px;width:100%;\">" +

            // ── Header ──
            "        <tr><td style=\"" +
            "          background:linear-gradient(135deg,#6c47ff 0%,#a855f7 50%,#ec4899 100%);" +
            "          border-radius:16px 16px 0 0;" +
            "          padding:40px 40px 32px;" +
            "          text-align:center;" +
            "        \">" +
            "          <div style=\"display:inline-block;" +
            "            width:64px;height:64px;background:rgba(255,255,255,0.15);" +
            "            border-radius:50%;margin-bottom:16px;line-height:64px;font-size:28px;\">" +
            "            &#128274;" +
            "          </div>" +
            "          <h1 style=\"margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;\">" +
            "            Password Reset Request" +
            "          </h1>" +
            "          <p style=\"margin:8px 0 0;color:rgba(255,255,255,0.75);font-size:14px;\">Expense Tracker</p>" +
            "        </td></tr>" +

            // ── Body ──
            "        <tr><td style=\"" +
            "          background:#1a1a2e;" +
            "          padding:36px 40px;" +
            "        \">" +
            "          <p style=\"margin:0 0 8px;color:#a0a0c0;font-size:13px;text-transform:uppercase;" +
            "            letter-spacing:1px;font-weight:600;\">Hello,</p>" +
            "          <h2 style=\"margin:0 0 20px;color:#ffffff;font-size:22px;font-weight:600;\">" +
            firstName +
            "          </h2>" +
            "          <p style=\"margin:0 0 28px;color:#b0b0d0;font-size:15px;line-height:1.7;\">" +
            "            We received a request to reset the password for your <strong style=\"color:#a78bfa;\">Expense Tracker</strong> account. " +
            "            Click the button below to choose a new password." +
            "          </p>" +

            // ── CTA Button ──
            "          <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td align=\"center\" style=\"padding-bottom:28px;\">" +
            "            <a href=\"" + resetUrl + "\" style=\"" +
            "              display:inline-block;" +
            "              background:linear-gradient(135deg,#6c47ff,#a855f7);" +
            "              color:#ffffff;" +
            "              text-decoration:none;" +
            "              font-size:15px;" +
            "              font-weight:700;" +
            "              padding:16px 40px;" +
            "              border-radius:50px;" +
            "              letter-spacing:0.5px;" +
            "              box-shadow:0 4px 24px rgba(108,71,255,0.5);" +
            "            \">&#128273;&nbsp; Reset My Password</a>" +
            "          </td></tr></table>" +

            // ── Expiry notice ──
            "          <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-bottom:24px;\">" +
            "            <tr><td style=\"" +
            "              background:rgba(108,71,255,0.1);" +
            "              border:1px solid rgba(108,71,255,0.25);" +
            "              border-radius:10px;" +
            "              padding:14px 18px;" +
            "            \">" +
            "              <span style=\"font-size:18px;margin-right:10px;\">&#8987;</span>" +
            "              <span style=\"color:#c4b5fd;font-size:13px;\">" +
            "                This link will expire in <strong>24 hours</strong>." +
            "              </span>" +
            "            </td></tr>" +
            "          </table>" +

            // ── Fallback URL ──
            "          <p style=\"color:#6060a0;font-size:12px;margin:0 0 8px;\">If the button doesn't work, copy and paste this link into your browser:</p>" +
            "          <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-bottom:28px;\"><tr><td style=\"" +
            "            background:#12122a;" +
            "            border-radius:8px;" +
            "            padding:12px 14px;" +
            "            word-break:break-all;" +
            "          \">" +
            "            <a href=\"" + resetUrl + "\" style=\"color:#a78bfa;font-size:12px;text-decoration:none;\">" + resetUrl + "</a>" +
            "          </td></tr></table>" +

            // ── Security Notice ──
            "          <table width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr><td style=\"" +
            "            background:rgba(236,72,153,0.08);" +
            "            border-left:4px solid #ec4899;" +
            "            border-radius:0 8px 8px 0;" +
            "            padding:14px 18px;" +
            "          \">" +
            "            <p style=\"margin:0 0 4px;color:#f472b6;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;\">&#128274; Security Notice</p>" +
            "            <p style=\"margin:0;color:#b0b0d0;font-size:13px;line-height:1.6;\">" +
            "              This email was sent only to your registered email address. " +
            "              If you did <strong style=\"color:#f472b6;\">not</strong> request a password reset, " +
            "              please ignore this email and consider changing your password immediately." +
            "            </p>" +
            "          </td></tr></table>" +
            "        </td></tr>" +

            // ── Footer ──
            "        <tr><td style=\"" +
            "          background:#12122a;" +
            "          border-radius:0 0 16px 16px;" +
            "          padding:24px 40px;" +
            "          text-align:center;" +
            "          border-top:1px solid rgba(255,255,255,0.05);" +
            "        \">" +
            "          <p style=\"margin:0 0 6px;color:#6060a0;font-size:12px;\">Best regards,</p>" +
            "          <p style=\"margin:0;color:#a78bfa;font-size:13px;font-weight:600;\">&#128200; Expense Tracker Team</p>" +
            "          <p style=\"margin:12px 0 0;color:#404060;font-size:11px;\">&copy; 2025 Expense Tracker. All rights reserved.</p>" +
            "        </td></tr>" +

            "      </table>" +
            "    </td></tr>" +
            "  </table>" +
            "</body>" +
            "</html>";
    }

    private String buildPasswordResetEmailText(String firstName, String resetUrl) {
        return "Hello " + firstName + ",\n\n" +
               "You have requested to reset your password for Expense Tracker.\n\n" +
               "Click the link below to reset your password:\n" +
               resetUrl + "\n\n" +
               "This link will expire in " + EXPIRATION_HOURS + " hours.\n\n" +
               "SECURITY NOTICE: This email was sent to your registered email address only. " +
               "If you did not request this password reset, please ignore this email and " +
               "consider changing your password immediately.\n\n" +
               "Best regards,\nExpense Tracker Team";
    }
    
    public void resetPassword(String token, String newPassword) {
        PasswordResetToken resetToken = tokenRepository.findByToken(token)
                .orElseThrow(() -> new RuntimeException("Invalid password reset token"));
        
        if (resetToken.isUsed()) {
            throw new RuntimeException("This password reset token has already been used");
        }
        
        if (resetToken.isExpired()) {
            throw new RuntimeException("This password reset token has expired");
        }
        
        // Fetch user directly from repository to avoid lazy loading issues
        Long userId = resetToken.getUser().getId();
        User user = userRepository.findById(Objects.requireNonNull(userId))
                .orElseThrow(() -> new RuntimeException("User not found"));
        
        // Encode and update password
        String encodedPassword = passwordEncoder.encode(newPassword);
        user.setPassword(encodedPassword);
        
        // Save user first to ensure password is updated
        userRepository.save(user);
        userRepository.flush(); // Force immediate database update
        
        // Mark token as used
        resetToken.setUsed(true);
        tokenRepository.save(resetToken);
    }
    
    public void cleanupExpiredTokens() {
        tokenRepository.deleteByExpiryDateBefore(LocalDateTime.now());
    }
}
