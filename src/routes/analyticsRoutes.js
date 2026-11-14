const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/dashboard', (req, res, next) => analyticsController.getDashboardData(req, res, next));
router.get('/category-spending', (req, res, next) => analyticsController.getCategorySpending(req, res, next));
router.get('/monthly-trend', (req, res, next) => analyticsController.getMonthlyTrend(req, res, next));
router.get('/budget-status', (req, res, next) => analyticsController.getBudgetStatus(req, res, next));

module.exports = router;

