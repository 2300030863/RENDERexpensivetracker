const express = require('express');
const router = express.Router();
const budgetController = require('../controllers/budgetController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', (req, res, next) => budgetController.getAllBudgets(req, res, next));
router.get('/:id', (req, res, next) => budgetController.getBudget(req, res, next));
router.post('/', (req, res, next) => budgetController.createBudget(req, res, next));
router.put('/:id', (req, res, next) => budgetController.updateBudget(req, res, next));
router.delete('/:id', (req, res, next) => budgetController.deleteBudget(req, res, next));

module.exports = router;

