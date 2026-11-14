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

// Health and Actuator endpoints
router.get('/health', (req, res) => res.json({ status: 'UP', service: 'Expense Tracker Backend Node.js' }));
router.get('/actuator/health', (req, res) => res.json({ status: 'UP' }));
router.get('/actuator/info', (req, res) => res.json({ app: { name: 'Expense Tracker API', version: '1.0.0' } }));

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

module.exports = router;

