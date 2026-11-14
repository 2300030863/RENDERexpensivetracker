const express = require('express');
const router = express.Router();
const transactionController = require('../controllers/transactionController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/search', (req, res, next) => transactionController.searchTransactions(req, res, next));
router.get('/', (req, res, next) => transactionController.getAllTransactions(req, res, next));
router.get('/:id', (req, res, next) => transactionController.getTransaction(req, res, next));
router.post('/', (req, res, next) => transactionController.createTransaction(req, res, next));
router.put('/:id', (req, res, next) => transactionController.updateTransaction(req, res, next));
router.delete('/:id', (req, res, next) => transactionController.deleteTransaction(req, res, next));

module.exports = router;

