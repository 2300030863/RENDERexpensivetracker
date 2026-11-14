const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');

// Require authentication and at least ROLE_ADMIN or ROLE_OWNER
router.use(authenticateToken);
router.use(requireRole('ROLE_ADMIN', 'ROLE_OWNER'));

// Dashboard stats & aliases
router.get('/dashboard/stats', (req, res, next) => adminController.getDashboardStats(req, res, next));
router.get('/users/stats', (req, res, next) => adminController.getDashboardStats(req, res, next));
router.get('/transactions/stats', (req, res, next) => adminController.getDashboardStats(req, res, next));

// User management
router.get('/users', (req, res, next) => adminController.getAllUsers(req, res, next));
router.get('/users-with-groups', (req, res, next) => adminController.getAllUsersWithGroups(req, res, next));
router.put('/users/:id/change-role', requireRole('ROLE_OWNER'), (req, res, next) => adminController.changeUserRole(req, res, next));
router.get('/users/:id', (req, res, next) => adminController.getUserById(req, res, next));
router.post('/users', (req, res, next) => adminController.createUser(req, res, next));
router.delete('/users/:userId', (req, res, next) => adminController.deleteUser(req, res, next));
router.post('/users/:userId/block', (req, res, next) => adminController.blockUser(req, res, next));
router.post('/users/:userId/unblock', (req, res, next) => adminController.unblockUser(req, res, next));
router.post('/users/:userId/promote', requireRole('ROLE_OWNER'), (req, res, next) => adminController.promoteUserToAdmin(req, res, next));
router.get('/users/:userId/accounts', (req, res, next) => adminController.getUserAccounts(req, res, next));

// Transaction management
router.get('/transactions', (req, res, next) => adminController.getAllTransactions(req, res, next));
router.get('/users/:userId/transactions', (req, res, next) => adminController.getUserTransactions(req, res, next));
router.patch('/transactions/:transactionId/approve', (req, res, next) => adminController.approveTransaction(req, res, next));

// Category management
router.get('/categories', (req, res, next) => adminController.getAllCategories(req, res, next));
router.post('/categories', (req, res, next) => adminController.createCategory(req, res, next));
router.put('/categories/:id', (req, res, next) => adminController.updateCategory(req, res, next));
router.delete('/categories/:id', (req, res, next) => adminController.deleteCategory(req, res, next));

// Budget management
router.post('/budgets', (req, res, next) => adminController.createBudget(req, res, next));

// User Group management
router.post('/user-groups', (req, res, next) => adminController.createUserGroup(req, res, next));
router.get('/user-groups', (req, res, next) => adminController.getUserGroups(req, res, next));
router.put('/users/:userId/group/:groupId', (req, res, next) => adminController.assignUserToGroup(req, res, next));
router.get('/user-groups/:groupId/users', (req, res, next) => adminController.getUsersInGroup(req, res, next));

// Owner-only operations
router.post('/create-admin', requireRole('ROLE_OWNER'), (req, res, next) => adminController.createAdmin(req, res, next));
router.get('/admins', requireRole('ROLE_OWNER'), (req, res, next) => adminController.getAllAdmins(req, res, next));
router.delete('/admins/:adminId', requireRole('ROLE_OWNER'), (req, res, next) => adminController.deleteAdmin(req, res, next));
router.post('/send-email', requireRole('ROLE_OWNER'), (req, res, next) => adminController.sendEmailToUsers(req, res, next));
router.post('/send-email-to-all', requireRole('ROLE_OWNER'), (req, res, next) => adminController.sendEmailToAllByRole(req, res, next));

module.exports = router;

