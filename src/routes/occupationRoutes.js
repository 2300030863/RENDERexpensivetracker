const express = require('express');
const router = express.Router();
const occupationController = require('../controllers/occupationController');
const { authenticateToken } = require('../middleware/auth');

// Public listing & preview
router.get('/', (req, res, next) => occupationController.getAllOccupations(req, res, next));
router.get('/:id', (req, res, next) => occupationController.getOccupationById(req, res, next));
router.get('/:id/categories', (req, res, next) => occupationController.getOccupationCategories(req, res, next));

// Authenticated user occupation update
router.put('/update', authenticateToken, (req, res, next) => occupationController.updateUserOccupation(req, res, next));

module.exports = router;

