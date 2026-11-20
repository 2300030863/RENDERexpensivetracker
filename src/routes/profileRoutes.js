const express = require('express');
const router = express.Router();
const userProfileController = require('../controllers/userProfileController');
const { authenticateToken } = require('../middleware/auth');

router.use(authenticateToken);

router.get('/', (req, res, next) => userProfileController.getProfile(req, res, next));
router.put('/', (req, res, next) => userProfileController.updateProfile(req, res, next));
router.post('/change-password', (req, res, next) => userProfileController.changePassword(req, res, next));
router.delete('/', (req, res, next) => userProfileController.deleteMyAccount(req, res, next));

module.exports = router;

