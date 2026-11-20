const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const occupationRoutes = require('./occupationRoutes');
const transactionRoutes = require('./transactionRoutes');
const categoryRoutes = require('./categoryRoutes');
const accountRoutes = require('./accountRoutes');
const budgetRoutes = require('./budgetRoutes');
const analyticsRoutes = require('./analyticsRoutes');
const recurringTransactionRoutes = require('./recurringTransactionRoutes');
const adminRoutes = require('./adminRoutes');
const paymentRoutes = require('./paymentRoutes');

const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');

// Health and Actuator endpoints
router.get('/health', (req, res) => res.json({ status: 'UP', service: 'Expense Tracker Backend Node.js' }));
router.get('/actuator/health', (req, res) => res.json({ status: 'UP' }));
router.get('/actuator/info', (req, res) => res.json({ app: { name: 'Expense Tracker API', version: '1.0.0' } }));

// Dashboard alias (redirects or serves analytics data if authenticated)
router.get('/dashboard', authenticateToken, (req, res, next) => analyticsController.getDashboardData(req, res, next));

// Frontend app path redirection if accessed directly on backend domain
router.get(['/app', '/app/*'], (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL || 'https://experiencetracker.vercel.app';
  return res.redirect(`${frontendUrl}${req.path}`);
});

// Sub-routers
router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/api/occupations', occupationRoutes);
router.use('/transactions', transactionRoutes);
router.use('/categories', categoryRoutes);
router.use('/accounts', accountRoutes);
router.use('/budgets', budgetRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/recurring-transactions', recurringTransactionRoutes);
router.use('/admin', adminRoutes);
router.use('/payments', paymentRoutes);

module.exports = router;

