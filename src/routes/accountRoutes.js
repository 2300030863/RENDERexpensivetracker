const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', (req, res, next) => accountController.getAllAccounts(req, res, next));
router.get('/:id', (req, res, next) => accountController.getAccount(req, res, next));
router.post('/', (req, res, next) => accountController.createAccount(req, res, next));
router.put('/:id', (req, res, next) => accountController.updateAccount(req, res, next));
router.delete('/:id', (req, res, next) => accountController.deleteAccount(req, res, next));

module.exports = router;

