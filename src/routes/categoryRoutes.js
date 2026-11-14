const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categoryController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', (req, res, next) => categoryController.getAllCategories(req, res, next));
router.get('/:id', (req, res, next) => categoryController.getCategory(req, res, next));
router.post('/', (req, res, next) => categoryController.createCategory(req, res, next));
router.put('/:id', (req, res, next) => categoryController.updateCategory(req, res, next));
router.delete('/:id', (req, res, next) => categoryController.deleteCategory(req, res, next));

module.exports = router;

