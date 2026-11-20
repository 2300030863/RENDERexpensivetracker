const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const passwordResetController = require('../controllers/passwordResetController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

// Public auth endpoints
router.post('/login', (req, res, next) => authController.login(req, res, next));
router.post('/register', (req, res, next) => authController.register(req, res, next));
router.post('/google', (req, res, next) => authController.googleLogin(req, res, next));
router.post('/send-otp', (req, res, next) => authController.sendOtp(req, res, next));
router.post('/verify-otp', (req, res, next) => authController.verifyOtp(req, res, next));
router.get('/health', (req, res, next) => authController.healthCheck(req, res, next));
// Email diagnostics: owner only (it used to be public and leaked configuration details)
router.get('/email-test', authenticateToken, requireRole('ROLE_OWNER'), (req, res, next) => authController.testEmail(req, res, next));

// Password reset (mapped under /auth/* for Spring Boot frontend compatibility)
router.post('/forgot-password', (req, res, next) => passwordResetController.forgotPassword(req, res, next));
router.post('/reset-password', (req, res, next) => passwordResetController.resetPassword(req, res, next));
router.get('/validate-reset-token', (req, res, next) => passwordResetController.validateToken(req, res, next));
router.get('/otp-status', (req, res, next) => passwordResetController.getOtpStatus(req, res, next));

// Protected auth verification endpoint
router.get('/verify', authenticateToken, (req, res, next) => authController.verifyToken(req, res, next));

module.exports = router;

