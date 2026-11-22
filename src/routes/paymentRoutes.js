const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');

// Strict rate limiter for payment order creation & verification
const paymentOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many payment requests. Please wait a few minutes before trying again.' },
});

// -----------------------------------------------------------------------------
// 1. PUBLIC GATEWAY ENDPOINTS (No user JWT required for webhooks / public config)
// -----------------------------------------------------------------------------
router.post('/gateway/webhook', (req, res, next) => paymentController.processGatewayWebhook(req, res, next));
router.post('/webhook', (req, res, next) => paymentController.processGatewayWebhook(req, res, next));
router.get('/gateway/config', (req, res, next) => paymentController.getGatewayConfig(req, res, next));

// -----------------------------------------------------------------------------
// 2. AUTHENTICATED PAYMENT ROUTES
// -----------------------------------------------------------------------------
router.use(authenticateToken);

// Gateway Operations (Razorpay / RBI-authorized Payment Aggregator)
router.post('/gateway/create-order', paymentOrderLimiter, (req, res, next) => paymentController.createGatewayOrder(req, res, next));
router.post('/gateway/:id/initiated', (req, res, next) => paymentController.markPaymentInitiated(req, res, next));
router.post('/gateway/verify-payment', paymentOrderLimiter, (req, res, next) => paymentController.verifyGatewayPayment(req, res, next));
router.get('/gateway/:id/status', (req, res, next) => paymentController.checkPaymentStatus(req, res, next));
router.post('/gateway/:id/retry', paymentOrderLimiter, (req, res, next) => paymentController.safeRetryGatewayPayment(req, res, next));

// Recipient routes (must come before /:id)
router.get('/recipients/list', (req, res, next) => paymentController.getRecipients(req, res, next));
router.get('/recipients/recent', (req, res, next) => paymentController.getRecentRecipients(req, res, next));
router.get('/recipients/favorites', (req, res, next) => paymentController.getFavoriteRecipients(req, res, next));
router.post('/recipients', (req, res, next) => paymentController.createRecipient(req, res, next));
router.patch('/recipients/:id/favorite', (req, res, next) => paymentController.toggleFavoriteRecipient(req, res, next));
router.delete('/recipients/:id', (req, res, next) => paymentController.deleteRecipient(req, res, next));

// Legacy / Direct Payment operations (preserved for compatibility)
router.get('/', (req, res, next) => paymentController.getPayments(req, res, next));
router.post('/', (req, res, next) => paymentController.createPayment(req, res, next));
router.post('/initiate-upi', (req, res, next) => paymentController.initiateUpiPayment(req, res, next));
router.get('/:id', (req, res, next) => paymentController.getPaymentById(req, res, next));
router.patch('/:id/cancel', (req, res, next) => paymentController.cancelPayment(req, res, next));
router.post('/:id/retry', (req, res, next) => paymentController.retryPayment(req, res, next));
router.patch('/:id/status', (req, res, next) => paymentController.updatePaymentStatus(req, res, next));
router.get('/:id/attempts', (req, res, next) => paymentController.getPaymentAttempts(req, res, next));

module.exports = router;
