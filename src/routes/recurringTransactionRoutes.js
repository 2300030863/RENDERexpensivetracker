const express = require('express');
const router = express.Router();
const recurringTransactionController = require('../controllers/recurringTransactionController');
const { authenticateToken } = require('../middleware/auth');
const { parseId } = require('../utils/validate');
const { badRequest } = require('../utils/httpError');

router.use(authenticateToken);

// Reject anything that is not a positive integer before it reaches the database layer
router.param('id', (req, res, next, value) => {
  const id = parseId(value);
  if (!id) return next(badRequest('Invalid id'));
  req.params.id = id;
  return next();
});

router.get('/', (req, res, next) => recurringTransactionController.getAllRecurringTransactions(req, res, next));
router.get('/active', (req, res, next) => recurringTransactionController.getActiveRecurringTransactions(req, res, next));
router.get('/:id', (req, res, next) => recurringTransactionController.getRecurringTransaction(req, res, next));
router.post('/', (req, res, next) => recurringTransactionController.createRecurringTransaction(req, res, next));
router.put('/:id', (req, res, next) => recurringTransactionController.updateRecurringTransaction(req, res, next));
router.delete('/:id', (req, res, next) => recurringTransactionController.deleteRecurringTransaction(req, res, next));
router.post('/:id/toggle', (req, res, next) => recurringTransactionController.toggleRecurringTransaction(req, res, next));
router.post('/:id/execute', (req, res, next) => recurringTransactionController.executeRecurringTransaction(req, res, next));

module.exports = router;

