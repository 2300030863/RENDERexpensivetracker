package com.expensetracker.service;

import com.expensetracker.entity.EmailOtp;
import com.expensetracker.repository.EmailOtpRepository;
import com.expensetracker.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.mail.MessagingException;
import javax.mail.internet.MimeMessage;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;

@Service
@Transactional
public class EmailOtpService {

    private static final Logger logger = LoggerFactory.getLogger(EmailOtpService.class);
    private static final int OTP_LENGTH = 6;
    private static final int OTP_EXPIRY_MINUTES = 5;
    private static final SecureRandom random = new SecureRandom();

    @Autowired
    private EmailOtpRepository emailOtpRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JavaMailSender mailSender;

    @Value("${app.email.from:experiencetracker52@gmail.com}")
    private String fromEmail;

    /**
     * Generate and send OTP to the given email.
     * Deletes any previous OTPs for the same email first.
     */
    public void sendOtp(String email) {
        // Check if email is already registered
        if (userRepository.existsByEmail(email)) {
            throw new RuntimeException("Email is already registered");
        }

        // Delete old OTPs for this email
        emailOtpRepository.deleteByEmail(email);

        // Generate 6-digit OTP
        String otp = generateOtp();

        // Store OTP
        EmailOtp emailOtp = new EmailOtp(
                email,
                otp,
                LocalDateTime.now().plusMinutes(OTP_EXPIRY_MINUTES)
        );
        emailOtpRepository.save(emailOtp);

        // Send email
        sendOtpEmail(email, otp);

        logger.info("OTP sent to email: {}", email);
    }

    /**
     * Verify the OTP for the given email.
     * Returns true if OTP is valid and not expired.
     */
    public boolean verifyOtp(String email, String otp) {
        Optional<EmailOtp> otpRecord = emailOtpRepository
                .findTopByEmailAndVerifiedFalseOrderByCreatedAtDesc(email);

        if (otpRecord.isEmpty()) {
            logger.warn("No OTP found for email: {}", email);
            return false;
        }

        EmailOtp record = otpRecord.get();

        // Check expiry
        if (record.getExpiresAt().isBefore(LocalDateTime.now())) {
            logger.warn("OTP expired for email: {}", email);
            return false;
        }

        // Check OTP match
        if (!record.getOtp().equals(otp)) {
            logger.warn("Invalid OTP for email: {}", email);
            return false;
        }

        // Mark as verified
        record.setVerified(true);
        emailOtpRepository.save(record);

        logger.info("OTP verified successfully for email: {}", email);
        return true;
    }

    /**
     * Check if the email has a verified OTP record.
     */
    public boolean isEmailVerified(String email) {
        return emailOtpRepository
                .findTopByEmailAndVerifiedTrueOrderByCreatedAtDesc(email)
                .isPresent();
    }

    private String generateOtp() {
        StringBuilder sb = new StringBuilder(OTP_LENGTH);
        for (int i = 0; i < OTP_LENGTH; i++) {
            sb.append(random.nextInt(10));
        }
        return sb.toString();
    }

    private void sendOtpEmail(String email, String otp) {
        try {
            MimeMessage mimeMessage = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(mimeMessage, true, "UTF-8");

            String safeFrom = Objects.requireNonNullElse(fromEmail, "");
            helper.setFrom(safeFrom);
            helper.setTo(email);
            helper.setSubject("Verify Your Email – Expense Tracker");

            String htmlContent = buildOtpEmailHtml(otp);
            String plainText = "Your verification code is: " + otp + "\n\nThis code expires in " + OTP_EXPIRY_MINUTES + " minutes.\n\nIf you didn't request this, please ignore this email.";
            helper.setText(plainText, htmlContent);

            mailSender.send(mimeMessage);
        } catch (MessagingException e) {
            throw new RuntimeException("Failed to send OTP email", e);
        }
    }

    private String buildOtpEmailHtml(String otp) {
        StringBuilder sb = new StringBuilder();
        sb.append("<!DOCTYPE html>");
        sb.append("<html><head><meta charset='UTF-8'></head><body style='margin:0;padding:0;font-family:Arial,sans-serif;background-color:#f4f4f7;'>");
        sb.append("<div style='max-width:480px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);'>");

        // Header
        sb.append("<div style='background:linear-gradient(135deg,#f093fb 0%,#f5576c 100%);padding:32px 24px;text-align:center;'>");
        sb.append("<h1 style='color:#ffffff;margin:0;font-size:24px;font-weight:700;'>Email Verification</h1>");
        sb.append("<p style='color:rgba(255,255,255,0.9);margin:8px 0 0;font-size:14px;'>Expense Tracker</p>");
        sb.append("</div>");

        // Body
        sb.append("<div style='padding:32px 24px;text-align:center;'>");
        sb.append("<p style='color:#374151;font-size:16px;margin:0 0 24px;'>Enter this code to verify your email address:</p>");

        // OTP digits
        sb.append("<div style='display:inline-block;background:#f8f9fa;border-radius:12px;padding:16px 24px;margin:0 0 24px;'>");
        sb.append("<span style='font-size:36px;font-weight:800;letter-spacing:8px;color:#1f2937;font-family:monospace;'>");
        sb.append(otp);
        sb.append("</span>");
        sb.append("</div>");

        sb.append("<p style='color:#6b7280;font-size:14px;margin:0 0 8px;'>This code expires in <strong>").append(OTP_EXPIRY_MINUTES).append(" minutes</strong>.</p>");
        sb.append("<p style='color:#9ca3af;font-size:13px;margin:0;'>If you didn't request this, please ignore this email.</p>");
        sb.append("</div>");

        // Footer
        sb.append("<div style='background:#f8f9fa;padding:16px 24px;text-align:center;border-top:1px solid #e5e7eb;'>");
        sb.append("<p style='color:#9ca3af;font-size:12px;margin:0;'>© Expense Tracker. All rights reserved.</p>");
        sb.append("</div>");

        sb.append("</div></body></html>");
        return sb.toString();
    }
}
