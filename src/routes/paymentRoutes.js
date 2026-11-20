const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken } = require('../middleware/auth');

// All payment routes require authentication
router.use(authenticateToken);

// 1. Recipient routes (must come before /:id)
router.get('/recipients/list', (req, res, next) => paymentController.getRecipients(req, res, next));
router.get('/recipients/recent', (req, res, next) => paymentController.getRecentRecipients(req, res, next));
router.get('/recipients/favorites', (req, res, next) => paymentController.getFavoriteRecipients(req, res, next));
router.post('/recipients', (req, res, next) => paymentController.createRecipient(req, res, next));
router.patch('/recipients/:id/favorite', (req, res, next) => paymentController.toggleFavoriteRecipient(req, res, next));
router.delete('/recipients/:id', (req, res, next) => paymentController.deleteRecipient(req, res, next));

// 2. Payment operations
router.get('/', (req, res, next) => paymentController.getPayments(req, res, next));
router.post('/', (req, res, next) => paymentController.createPayment(req, res, next));
router.post('/initiate-upi', (req, res, next) => paymentController.initiateUpiPayment(req, res, next));
router.get('/:id', (req, res, next) => paymentController.getPaymentById(req, res, next));
router.patch('/:id/cancel', (req, res, next) => paymentController.cancelPayment(req, res, next));
router.post('/:id/retry', (req, res, next) => paymentController.retryPayment(req, res, next));
router.patch('/:id/status', (req, res, next) => paymentController.updatePaymentStatus(req, res, next));
router.get('/:id/attempts', (req, res, next) => paymentController.getPaymentAttempts(req, res, next));

module.exports = router;
