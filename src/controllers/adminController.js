const adminService = require('../services/adminService');
const emailCommunicationService = require('../services/emailCommunicationService');
const categoryService = require('../services/categoryService');
const emailOtpService = require('../services/emailOtpService');
const userRepository = require('../repositories/userRepository');

class AdminController {
  async getDashboardStats(req, res, next) {
    try {
      const stats = await adminService.getAdminDashboardStats(req.user);
      res.json(stats);
    } catch (err) {
      console.error('[AdminController] getDashboardStats error:', err);
      next(err);
    }
  }

  async getAllUsers(req, res, next) {
    try {
      const users = await adminService.getUsersForAdmin(req.user);
      res.json(users);
    } catch (err) {
      console.error('[AdminController] getAllUsers error:', err);
      next(err);
    }
  }

  async getAllUsersWithGroups(req, res, next) {
    try {
      const users = await adminService.getUsersWithGroupInfo(req.user);
      res.json(users);
    } catch (err) {
      console.error('[AdminController] getAllUsersWithGroups error:', err);
      next(err);
    }
  }

  async changeUserRole(req, res, next) {
    try {
      const targetRole = req.body.role;
      if (targetRole !== 'ROLE_USER' && targetRole !== 'ROLE_ADMIN') {
        return res.status(400).json({ error: 'Invalid role. Must be ROLE_USER or ROLE_ADMIN' });
      }

      await adminService.changeUserRole(req.params.id, targetRole);
      res.json({ message: 'Role changed successfully' });
    } catch (err) {
      console.error('[AdminController] changeUserRole error:', err);
      next(err);
    }
  }

  async getUserById(req, res, next) {
    try {
      const user = await adminService.getUserByIdForAdmin(req.user, req.params.id);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      res.json(user);
    } catch (err) {
      console.error('[AdminController] getUserById error:', err);
      next(err);
    }
  }

  async createUser(req, res, next) {
    try {
      const { username, email, password, firstName, lastName } = req.body;
      const user = await adminService.createUserForAdmin(
        req.user,
        username,
        email,
        password,
        firstName,
        lastName
      );
      res.status(201).json(user);
    } catch (err) {
      console.error('[AdminController] createUser error:', err);
      next(err);
    }
  }

  async requestDeleteOtp(req, res, next) {
    try {
      if (req.user.role !== 'ROLE_OWNER') {
        return res.status(403).json({ error: 'Only OWNER can request account deletion OTP' });
      }

      const userId = req.body?.userId || req.params?.userId;
      if (!userId) {
        return res.status(400).json({ error: 'Target User ID is required' });
      }

      const targetUser = await userRepository.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Target user not found' });
      }

      if (targetUser.role === 'ROLE_OWNER' || targetUser.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete owner account' });
      }

      const result = await emailOtpService.sendDeleteAccountOtp(req.user.email, targetUser.username);
      res.json({
        success: true,
        message: `Security code sent to ${req.user.email}`,
        delivered: result.delivered,
      });
    } catch (err) {
      console.error('[AdminController] requestDeleteOtp error:', err);
      next(err);
    }
  }

  async deleteUser(req, res, next) {
    try {
      if (req.user.role !== 'ROLE_OWNER') {
        return res.status(403).json({ error: 'Only OWNER can delete user accounts' });
      }

      const userId = req.params.userId || req.params.id;
      const targetUser = await userRepository.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (targetUser.role === 'ROLE_OWNER' || targetUser.id === req.user.id) {
        return res.status(400).json({ error: 'Cannot delete owner account' });
      }

      // Check confirmation username
      const confirmationUsername = req.body?.confirmationUsername || req.headers['x-confirmation-username'] || req.query?.confirmationUsername;
      if (!confirmationUsername || confirmationUsername.trim() !== targetUser.username) {
        return res.status(400).json({
          error: `Username confirmation mismatch. Please type exact username "${targetUser.username}" to confirm deletion.`,
        });
      }

      // Check OTP
      const otp = req.body?.otp || req.headers['x-delete-otp'] || req.query?.otp;
      if (!otp || !otp.toString().trim()) {
        return res.status(400).json({ error: 'Verification OTP is required to delete this account.' });
      }

      await emailOtpService.verifyOtp(req.user.email, otp.toString().trim());

      await adminService.deleteUserForAdmin(req.user, userId);
      res.json({ success: true, message: `Account "${targetUser.username}" has been permanently deleted.` });
    } catch (err) {
      console.error('[AdminController] deleteUser error:', err);
      next(err);
    }
  }

  async getAllTransactions(req, res, next) {
    try {
      const transactions = await adminService.getTransactionsForAdmin(req.user);
      res.json(transactions);
    } catch (err) {
      console.error('[AdminController] getAllTransactions error:', err);
      next(err);
    }
  }

  async getUserTransactions(req, res, next) {
    try {
      const transactions = await adminService.getTransactionsForUserByAdmin(req.user, req.params.userId);
      res.json(transactions);
    } catch (err) {
      console.error('[AdminController] getUserTransactions error:', err);
      next(err);
    }
  }

  async approveTransaction(req, res, next) {
    try {
      const transaction = await adminService.approveTransaction(req.user, req.params.transactionId);
      res.json(transaction);
    } catch (err) {
      console.error('[AdminController] approveTransaction error:', err);
      next(err);
    }
  }

  async getAllCategories(req, res, next) {
    try {
      const categories = await adminService.getCategoriesForAdmin(req.user);
      res.json(categories);
    } catch (err) {
      console.error('[AdminController] getAllCategories error:', err);
      next(err);
    }
  }

  async createCategory(req, res, next) {
    try {
      const { name, description, color } = req.body;
      const category = await adminService.createCategoryForAdmin(req.user, name, description, color);
      res.status(201).json(category);
    } catch (err) {
      console.error('[AdminController] createCategory error:', err);
      next(err);
    }
  }

  async updateCategory(req, res, next) {
    try {
      const category = await categoryService.updateCategory(req.user, req.params.id, req.body);
      res.json(category);
    } catch (err) {
      console.error('[AdminController] updateCategory error:', err);
      next(err);
    }
  }

  async deleteCategory(req, res, next) {
    try {
      await categoryService.deleteCategory(req.user, req.params.id);
      res.status(200).json({ message: 'Category deleted successfully' });
    } catch (err) {
      console.error('[AdminController] deleteCategory error:', err);
      next(err);
    }
  }

  async createBudget(req, res, next) {
    try {
      const { amount, categoryId } = req.body;
      const budget = await adminService.createBudgetForAdmin(req.user, amount, categoryId);
      res.status(201).json(budget);
    } catch (err) {
      console.error('[AdminController] createBudget error:', err);
      next(err);
    }
  }

  async createAdmin(req, res, next) {
    try {
      const { username, email, password, firstName, lastName } = req.body;
      const admin = await adminService.createAdminUser(
        req.user,
        username,
        email,
        password,
        firstName,
        lastName
      );
      res.status(201).json(admin);
    } catch (err) {
      console.error('[AdminController] createAdmin error:', err);
      next(err);
    }
  }

  async getAllAdmins(req, res, next) {
    try {
      const admins = await adminService.getAllAdmins(req.user);
      res.json(admins);
    } catch (err) {
      console.error('[AdminController] getAllAdmins error:', err);
      next(err);
    }
  }

  async deleteAdmin(req, res, next) {
    try {
      await adminService.deleteAdmin(req.user, req.params.adminId);
      res.json({ message: 'Admin deleted successfully' });
    } catch (err) {
      console.error('[AdminController] deleteAdmin error:', err);
      next(err);
    }
  }

  async createUserGroup(req, res, next) {
    try {
      const { name, description } = req.body;
      const userGroup = await adminService.createUserGroup(req.user, name, description);
      res.status(201).json(userGroup);
    } catch (err) {
      console.error('[AdminController] createUserGroup error:', err);
      next(err);
    }
  }

  async getUserGroups(req, res, next) {
    try {
      const groups = await adminService.getUserGroupsForAdmin(req.user);
      res.json(groups);
    } catch (err) {
      console.error('[AdminController] getUserGroups error:', err);
      next(err);
    }
  }

  async assignUserToGroup(req, res, next) {
    try {
      const user = await adminService.assignUserToGroup(req.user, req.params.userId, req.params.groupId);
      res.json(user);
    } catch (err) {
      console.error('[AdminController] assignUserToGroup error:', err);
      next(err);
    }
  }

  async getUsersInGroup(req, res, next) {
    try {
      const users = await adminService.getUsersInGroup(req.user, req.params.groupId);
      res.json(users);
    } catch (err) {
      console.error('[AdminController] getUsersInGroup error:', err);
      next(err);
    }
  }

  async getUserAccounts(req, res, next) {
    try {
      const accounts = await adminService.getUserAccountsForAdmin(req.user, req.params.userId);
      res.json(accounts);
    } catch (err) {
      console.error('[AdminController] getUserAccounts error:', err);
      next(err);
    }
  }

  async promoteUserToAdmin(req, res, next) {
    try {
      const user = await adminService.promoteUserToAdmin(req.user, req.params.userId);
      res.json({
        message: 'User promoted to admin successfully',
        user,
      });
    } catch (err) {
      console.error('[AdminController] promoteUserToAdmin error:', err);
      next(err);
    }
  }

  async sendEmailToUsers(req, res, next) {
    try {
      const { recipientIds, subject, message } = req.body;
      const senderName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.username;

      const sentCount = await emailCommunicationService.sendEmailToUsers(
        recipientIds,
        subject,
        message,
        senderName
      );

      res.json({
        message: 'Emails sent successfully to registered email addresses',
        sentCount,
        totalRequested: (recipientIds || []).length,
      });
    } catch (err) {
      console.error('[AdminController] sendEmailToUsers error:', err);
      next(err);
    }
  }

  async sendEmailToAllByRole(req, res, next) {
    try {
      const { role, subject, message } = req.query.role ? req.query : req.body;
      if (role !== 'ROLE_USER' && role !== 'ROLE_ADMIN') {
        return res.status(400).json({ error: 'Invalid role. Must be ROLE_USER or ROLE_ADMIN' });
      }

      const senderName = `${req.user.first_name || ''} ${req.user.last_name || ''}`.trim() || req.user.username;
      const sentCount = await emailCommunicationService.sendEmailToAllByRole(role, subject, message, senderName);

      res.json({
        message: `Emails sent successfully to all ${role === 'ROLE_ADMIN' ? 'admins' : 'users'}`,
        sentCount,
      });
    } catch (err) {
      console.error('[AdminController] sendEmailToAllByRole error:', err);
      next(err);
    }
  }

  async blockUser(req, res, next) {
    try {
      await adminService.blockUser(req.user, req.params.userId);
      res.json({ message: 'User blocked successfully' });
    } catch (err) {
      console.error('[AdminController] blockUser error:', err);
      next(err);
    }
  }

  async unblockUser(req, res, next) {
    try {
      await adminService.unblockUser(req.user, req.params.userId);
      res.json({ message: 'User unblocked successfully' });
    } catch (err) {
      console.error('[AdminController] unblockUser error:', err);
      next(err);
    }
  }
}

module.exports = new AdminController();

