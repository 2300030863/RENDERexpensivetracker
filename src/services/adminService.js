const bcrypt = require('bcryptjs');
const { execute } = require('../config/database');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');
const userGroupRepository = require('../repositories/userGroupRepository');
const transactionRepository = require('../repositories/transactionRepository');
const categoryRepository = require('../repositories/categoryRepository');
const budgetRepository = require('../repositories/budgetRepository');
const accountRepository = require('../repositories/accountRepository');
const recurringTransactionRepository = require('../repositories/recurringTransactionRepository');
const passwordResetTokenRepository = require('../repositories/passwordResetTokenRepository');
const occupationService = require('./occupationService');
const emailCommunicationService = require('./emailCommunicationService');

const isBlocked = (val) => {
  if (val === null || val === undefined) return false;
  if (Buffer.isBuffer(val)) return val.length > 0 && val[0] === 1;
  return val === true || val === 1 || val === '1';
};

class AdminService {
  async getAdminByUser(adminUser) {
    if (adminUser.role === 'ROLE_OWNER') {
      return null;
    }

    if (adminUser.role !== 'ROLE_ADMIN') {
      throw new Error('User is not an admin');
    }

    let admin = await adminRepository.findByEmail(adminUser.email);
    if (!admin) {
      admin = await adminRepository.findByUsername(adminUser.username);
      if (!admin) {
        // Auto-create Admin record
        admin = await adminRepository.create({
          username: adminUser.username,
          email: adminUser.email,
          password: adminUser.password,
          firstName: adminUser.first_name,
          lastName: adminUser.last_name,
          isActive: true,
          ownerId: adminUser.id,
        });
      }
    }
    return admin;
  }

  async getUsersForAdmin(adminUser) {
    if (adminUser.role === 'ROLE_OWNER') {
      return await userRepository.findByRole('ROLE_USER');
    }
    const admin = await this.getAdminByUser(adminUser);
    return await userRepository.findByAdmin(admin.id);
  }

  async getUsersWithGroupInfo(adminUser) {
    let users = [];

    if (adminUser.role === 'ROLE_OWNER') {
      users = await userRepository.findAllForOwner('ROLE_OWNER');
    } else if (adminUser.role === 'ROLE_ADMIN') {
      const admin = await this.getAdminByUser(adminUser);
      users = await userRepository.findByAdminManagedUsers(admin.id);
    } else {
      throw new Error('Access denied');
    }

    // Map to UserWithGroupDto
    const dtos = [];
    for (const u of users) {
      const userWithGroup = await userRepository.findByIdWithUserGroup(u.id);
      const isGroupMember = Boolean(userWithGroup.user_group_id);
      const effectiveAdminUsername = userWithGroup.admin_username || userWithGroup.group_admin_username || userWithGroup.direct_admin_username || null;

      dtos.push({
        id: userWithGroup.id,
        username: userWithGroup.username,
        email: userWithGroup.email,
        firstName: userWithGroup.first_name,
        lastName: userWithGroup.last_name,
        role: userWithGroup.role,
        blocked: isBlocked(userWithGroup.blocked),
        createdAt: userWithGroup.created_at,
        updatedAt: userWithGroup.updated_at,
        adminId: userWithGroup.group_admin_id || userWithGroup.admin_id || null,
        adminUsername: effectiveAdminUsername,
        userGroupId: userWithGroup.user_group_id || null,
        userGroupName: userWithGroup.group_name || null,
        isGroupMember,
      });
    }

    return dtos;
  }

  async changeUserRole(userId, targetRole) {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.role === 'ROLE_OWNER') {
      throw new Error('Cannot change owner role');
    }

    if (user.role === targetRole) {
      throw new Error(`User already has role: ${targetRole}`);
    }

    const oldRole = user.role;
    const fieldsToUpdate = { role: targetRole };

    if (targetRole === 'ROLE_ADMIN') {
      fieldsToUpdate.admin_id = null;
      fieldsToUpdate.user_group_id = null;

      let admin = await adminRepository.findByUsername(user.username);
      if (!admin) {
        admin = await adminRepository.findByEmail(user.email);
      }
      if (!admin) {
        await adminRepository.create({
          username: user.username,
          email: user.email,
          password: user.password,
          firstName: user.first_name,
          lastName: user.last_name,
          isActive: true,
        });
      } else {
        await execute('UPDATE admins SET is_active = 1 WHERE id = ?', [admin.id]);
      }
    } else if (targetRole === 'ROLE_USER') {
      // When demoted to Member (ROLE_USER), ensure user is unblocked
      fieldsToUpdate.blocked = false;

      // Inactivate any admin entry if it exists
      const admin = (await adminRepository.findByUsername(user.username)) || (await adminRepository.findByEmail(user.email));
      if (admin) {
        await execute('UPDATE admins SET is_active = 0 WHERE id = ?', [admin.id]);
      }
    }

    const updated = await userRepository.update(userId, fieldsToUpdate);

    // Send email notification if promoted to ADMIN
    if (targetRole === 'ROLE_ADMIN' && oldRole === 'ROLE_USER') {
      try {
        const subject = 'Your Role Has Been Updated - Expense Tracker';
        const message = `Congratulations! Your account has been upgraded to ADMIN role.\n\nYou now have access to additional features and privileges in the Expense Tracker system.\n\nPlease log in to your account to explore your new capabilities.\n\nIf you have any questions, please contact the system administrator.`;
        await emailCommunicationService.sendEmailToUsers([updated.id], subject, message, 'System Owner');
      } catch (err) {
        console.error('Failed to send role change email:', err.message);
      }
    }

    return updated;
  }

  async createUserForAdmin(adminUser, username, email, password, firstName, lastName) {
    if (await userRepository.existsByUsername(username)) {
      throw new Error('Username already exists');
    }
    if (await userRepository.existsByEmail(email)) {
      throw new Error('Email already exists');
    }

    const admin = await this.getAdminByUser(adminUser);
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    return await userRepository.create({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'ROLE_USER',
      adminId: admin.id,
    });
  }

  async deleteUserForAdmin(adminUser, userId) {
    const userOpt = await this.getUserByIdForAdmin(adminUser, userId);
    if (!userOpt) {
      throw new Error('User not found or access denied');
    }

    if (userOpt.role === 'ROLE_OWNER' || userOpt.id === adminUser.id) {
      throw new Error('Cannot delete owner account');
    }

    if (userOpt.role === 'ROLE_ADMIN' && adminUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can delete admin accounts');
    }

    // 1. Delete password reset tokens
    await passwordResetTokenRepository.deleteByUserId(userId);

    // 2. Keep transactions for audit trail, null out user_id
    await transactionRepository.nullifyUser(userId);

    // 3. Delete recurring transactions
    await recurringTransactionRepository.deleteByUserId(userId);

    // 4. Delete budgets
    await budgetRepository.deleteByUserId(userId);

    // 5. Delete categories
    await categoryRepository.deleteByUserId(userId);

    // 6. Delete accounts
    await accountRepository.deleteByUserId(userId);

    // 7. If user is an admin, delete/unlink admin references
    if (userOpt.role === 'ROLE_ADMIN') {
      const admin = (await adminRepository.findByUsername(userOpt.username)) || (await adminRepository.findByEmail(userOpt.email));
      if (admin) {
        await execute('UPDATE users SET admin_id = null WHERE admin_id = ?', [admin.id]);
        await execute('UPDATE user_groups SET admin_id = null WHERE admin_id = ?', [admin.id]);
        await adminRepository.delete(admin.id);
      }
    }

    // 8. Delete user
    await userRepository.delete(userId);
  }

  async getUserByIdForAdmin(adminUser, userId) {
    const user = await userRepository.findByIdWithUserGroup(userId);
    if (!user) return null;

    if (adminUser.role === 'ROLE_OWNER') {
      return user;
    }

    const admin = await this.getAdminByUser(adminUser);
    if (user.admin_id === admin.id || user.group_admin_id === admin.id) {
      return user;
    }

    return null;
  }

  async getTransactionsForAdmin(adminUser) {
    if (adminUser.role === 'ROLE_OWNER') {
      return await transactionRepository.findAll();
    }

    const admin = await this.getAdminByUser(adminUser);

    // Admin's own transactions
    const adminTxns = await transactionRepository.findByUser(adminUser.id);

    // Transactions from group members
    const groups = await userGroupRepository.findByAdmin(admin.id);
    const groupTxns = [];
    for (const g of groups) {
      const groupUsers = await userRepository.findByUserGroupId(g.id);
      for (const gu of groupUsers) {
        if (gu.role === 'ROLE_USER') {
          const txns = await transactionRepository.findByUser(gu.id);
          groupTxns.push(...txns);
        }
      }
    }

    return [...adminTxns, ...groupTxns];
  }

  async getTransactionsForUserByAdmin(adminUser, userId) {
    const user = await this.getUserByIdForAdmin(adminUser, userId);
    if (!user) {
      throw new Error('User not found or access denied');
    }
    return await transactionRepository.findByUser(userId);
  }

  async approveTransaction(adminUser, transactionId) {
    const transaction = await transactionRepository.findById(transactionId);
    if (!transaction) throw new Error('Transaction not found');

    if (adminUser.role === 'ROLE_OWNER') {
      return await transactionRepository.approve(transactionId);
    }

    const admin = await this.getAdminByUser(adminUser);
    const txnUser = await userRepository.findByIdWithUserGroup(transaction.user_id);
    if (txnUser && (txnUser.admin_id === admin.id || txnUser.group_admin_id === admin.id)) {
      return await transactionRepository.approve(transactionId);
    }

    throw new Error('Transaction not found or access denied');
  }

  async createCategoryForAdmin(adminUser, name, description, color) {
    const admin = await this.getAdminByUser(adminUser);
    return await categoryRepository.create({
      name,
      description,
      color,
      adminId: admin.id,
      isDefault: false,
    });
  }

  async getCategoriesForAdmin(adminUser) {
    if (adminUser.role === 'ROLE_OWNER') {
      return await categoryRepository.findAll();
    }

    const categories = [];

    // Admin's own categories + defaults
    const adminCats = await categoryRepository.findByUserOrIsDefaultTrueOrderByName(adminUser.id);
    categories.push(...adminCats);

    const admin = await this.getAdminByUser(adminUser);
    const userGroups = await userGroupRepository.findByAdmin(admin.id);

    for (const group of userGroups) {
      const groupCats = await categoryRepository.findByUserGroupOrIsDefaultTrue(group.id);
      for (const cat of groupCats) {
        if (!cat.is_default && !categories.some(c => c.id === cat.id)) {
          categories.push(cat);
        }
      }
    }

    return categories;
  }

  async createBudgetForAdmin(adminUser, amount, categoryId) {
    const admin = await this.getAdminByUser(adminUser);
    const category = await categoryRepository.findById(categoryId);
    if (!category) throw new Error('Category not found');

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date();
    nextYear.setFullYear(nextYear.getFullYear() + 1);
    const nextYearDate = nextYear.toISOString().split('T')[0];

    return await budgetRepository.create({
      amount,
      startDate: today,
      endDate: nextYearDate,
      type: 'MONTHLY',
      alertThreshold: 80,
      isActive: true,
      userId: adminUser.id,
      categoryId: category.id,
      adminId: admin.id,
    });
  }

  async getAdminDashboardStats(adminUser) {
    const users = await this.getUsersForAdmin(adminUser);
    const transactions = await this.getTransactionsForAdmin(adminUser);
    const categories = await this.getCategoriesForAdmin(adminUser);

    const pendingApprovals = transactions.filter(t => !t.is_approved).length;

    const totalIncome = transactions
      .filter(t => t.type === 'INCOME')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    const totalExpense = transactions
      .filter(t => t.type === 'EXPENSE')
      .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

    return {
      totalUsers: users.length,
      totalTransactions: transactions.length,
      pendingApprovals,
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      totalCategories: categories.length,
    };
  }

  async createAdminUser(ownerUser, username, email, password, firstName, lastName) {
    if (ownerUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can create admins');
    }

    if (await userRepository.existsByUsername(username)) {
      throw new Error('Username already exists');
    }
    if (await userRepository.existsByEmail(email)) {
      throw new Error('Email already exists');
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await userRepository.create({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      role: 'ROLE_ADMIN',
    });

    await adminRepository.create({
      username,
      email,
      password: hashedPassword,
      firstName,
      lastName,
      isActive: true,
      ownerId: ownerUser.id,
    });

    return user;
  }

  async getAllAdmins(ownerUser) {
    if (ownerUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can view all admins');
    }
    return await userRepository.findByRole('ROLE_ADMIN');
  }

  async deleteAdmin(ownerUser, adminId) {
    if (ownerUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can delete admins');
    }

    const adminUser = await userRepository.findById(adminId);
    if (adminUser && adminUser.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByEmail(adminUser.email);
      if (admin) {
        await adminRepository.delete(admin.id);
      }
      await userRepository.delete(adminId);
    }
  }

  async createUserGroup(adminUser, name, description) {
    let admin = null;
    if (adminUser.role === 'ROLE_OWNER') {
      admin = await adminRepository.findByEmail(adminUser.email);
      if (!admin) {
        admin = await adminRepository.create({
          username: adminUser.username,
          email: adminUser.email,
          password: adminUser.password,
          ownerId: adminUser.id,
        });
      }
    } else {
      admin = await this.getAdminByUser(adminUser);
    }

    const userGroup = await userGroupRepository.create({
      name,
      description,
      adminId: admin.id,
    });

    // Auto-assign admin user to this group
    await userRepository.update(adminUser.id, { user_group_id: userGroup.id });

    return userGroup;
  }

  async getUserGroupsForAdmin(adminUser) {
    if (adminUser.role === 'ROLE_OWNER') {
      return await userGroupRepository.findAll();
    }

    const admin = await adminRepository.findByEmail(adminUser.email);
    if (!admin) return [];

    return await userGroupRepository.findByAdmin(admin.id);
  }

  async assignUserToGroup(adminUser, userId, groupId) {
    const user = await this.getUserByIdForAdmin(adminUser, userId);
    if (!user) throw new Error('User not found or access denied');

    const group = await userGroupRepository.findById(groupId);
    if (!group) throw new Error('User group not found');

    if (adminUser.role !== 'ROLE_OWNER') {
      const admin = await this.getAdminByUser(adminUser);
      if (group.admin_id !== admin.id) {
        throw new Error('Access denied to this user group');
      }
    }

    const updatedUser = await userRepository.update(userId, { user_group_id: groupId });

    // Sync occupation with admin
    if (adminUser.occupation_id) {
      try {
        await occupationService.updateUserOccupation(updatedUser, adminUser.occupation_id);
      } catch (err) {
        console.error('Failed to sync occupation for group user:', err.message);
      }
    }

    return await userRepository.findByIdWithUserGroup(userId);
  }

  async getUsersInGroup(adminUser, groupId) {
    const group = await userGroupRepository.findById(groupId);
    if (!group) throw new Error('User group not found');

    if (adminUser.role !== 'ROLE_OWNER') {
      const admin = await this.getAdminByUser(adminUser);
      if (admin && group.admin_id !== admin.id) {
        throw new Error('Access denied to this user group');
      }
    }

    const users = await userRepository.findByUserGroupId(groupId);
    return users.filter(u => u.role === 'ROLE_USER');
  }

  async getUserAccountsForAdmin(adminUser, userId) {
    const user = await userRepository.findByIdWithUserGroup(userId);
    if (!user) throw new Error('User not found');

    if (adminUser.role === 'ROLE_OWNER') {
      return await accountRepository.findByUserId(userId);
    }

    if (adminUser.role === 'ROLE_ADMIN') {
      const admin = await this.getAdminByUser(adminUser);
      if (user.admin_id === admin.id || user.group_admin_id === admin.id) {
        return await accountRepository.findByUserId(userId);
      }
      throw new Error("Access denied to this user's accounts");
    }

    throw new Error('Insufficient permissions');
  }

  async promoteUserToAdmin(ownerUser, userId) {
    if (ownerUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can promote users to admin');
    }

    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');

    if (user.role === 'ROLE_ADMIN' || user.role === 'ROLE_OWNER') {
      throw new Error('User is already an admin or owner');
    }

    await userRepository.update(userId, {
      role: 'ROLE_ADMIN',
      admin_id: null,
      user_group_id: null,
    });

    let admin = await adminRepository.findByUsername(user.username);
    if (!admin) {
      admin = await adminRepository.create({
        username: user.username,
        email: user.email,
        password: user.password,
        ownerId: ownerUser.id,
      });
    }

    return await userRepository.findByIdWithUserGroup(userId);
  }

  async blockUser(adminUser, userId) {
    const user = await this.getUserByIdForAdmin(adminUser, userId);
    if (!user) throw new Error('User not found or access denied');

    if (user.role === 'ROLE_OWNER' || user.id === adminUser.id) {
      throw new Error('Cannot block owner account');
    }

    if (user.role === 'ROLE_ADMIN' && adminUser.role !== 'ROLE_OWNER') {
      throw new Error('Only OWNER can block admin accounts');
    }

    if (isBlocked(user.blocked)) {
      throw new Error('User is already blocked');
    }

    await userRepository.update(userId, { blocked: true });
  }

  async unblockUser(adminUser, userId) {
    const user = await this.getUserByIdForAdmin(adminUser, userId);
    if (!user) throw new Error('User not found or access denied');

    if (user.role === 'ROLE_OWNER' || user.id === adminUser.id) {
      throw new Error('Cannot unblock owner account');
    }

    if (!isBlocked(user.blocked)) {
      throw new Error('User is not blocked');
    }

    await userRepository.update(userId, { blocked: false });
  }
}

module.exports = new AdminService();

