const recurringTransactionRepository = require('../repositories/recurringTransactionRepository');
const transactionRepository = require('../repositories/transactionRepository');
const categoryRepository = require('../repositories/categoryRepository');
const accountRepository = require('../repositories/accountRepository');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');
const userGroupRepository = require('../repositories/userGroupRepository');

class RecurringTransactionService {
  calculateNextDueDate(currentDateStr, recurrenceType) {
    const d = new Date(currentDateStr);
    switch (recurrenceType) {
      case 'DAILY':
        d.setDate(d.getDate() + 1);
        break;
      case 'WEEKLY':
        d.setDate(d.getDate() + 7);
        break;
      case 'MONTHLY':
        d.setMonth(d.getMonth() + 1);
        break;
      case 'YEARLY':
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        throw new Error(`Unknown recurrence type: ${recurrenceType}`);
    }
    return d.toISOString().split('T')[0];
  }

  async getAllRecurringTransactions(user) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!fullUser) return [];

    if (fullUser.user_group_id) {
      return await recurringTransactionRepository.findByUserGroupOrderByNextDueDateAsc(fullUser.user_group_id);
    }
    return await recurringTransactionRepository.findByUserOrderByNextDueDateAsc(fullUser.id);
  }

  async getActiveRecurringTransactions(user) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!fullUser) return [];

    if (fullUser.user_group_id) {
      return await recurringTransactionRepository.findByUserGroupAndIsActiveTrueOrderByNextDueDateAsc(fullUser.user_group_id);
    }
    return await recurringTransactionRepository.findByUserAndIsActiveTrueOrderByNextDueDateAsc(fullUser.id);
  }

  async getRecurringTransaction(id, user) {
    const rt = await recurringTransactionRepository.findById(id);
    if (!rt) throw new Error('Recurring transaction not found');

    if (rt.user_id === user.id) return rt;

    const currentUser = await userRepository.findByIdWithUserGroup(user.id);
    if (currentUser && currentUser.user_group_id && rt.user_group_id) {
      if (currentUser.user_group_id === rt.user_group_id) {
        return rt;
      }
    }

    throw new Error('Recurring transaction not found');
  }

  async createRecurringTransaction(user, request) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    // Permission check for group members
    if (fullUser && fullUser.user_group_id && user.role !== 'ROLE_OWNER') {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const groups = await userGroupRepository.findByAdmin(admin.id);
        const isGroupAdmin = groups.some(g => g.id === fullUser.user_group_id);
        if (!isGroupAdmin) {
          throw new Error('Access denied: Group members cannot create recurring transactions. Only group admins can create recurring transactions.');
        }
      } else {
        throw new Error('Access denied: Group members cannot create recurring transactions. Only group admins can create recurring transactions.');
      }
    }

    const category = await categoryRepository.findById(request.categoryId || request.category_id);
    if (!category) throw new Error('Category not found');

    const account = await accountRepository.findById(request.accountId || request.account_id);
    if (!account) throw new Error('Account not found');

    const startDate = request.startDate || request.start_date;
    const recurrenceType = request.recurrenceType || request.recurrence_type;
    const nextDueDate = this.calculateNextDueDate(startDate, recurrenceType);

    return await recurringTransactionRepository.create({
      description: request.description,
      amount: request.amount,
      type: request.type,
      recurrenceType,
      startDate,
      endDate: request.endDate || request.end_date || null,
      nextDueDate,
      notes: request.notes,
      userId: user.id,
      categoryId: category.id,
      accountId: account.id,
    });
  }

  async updateRecurringTransaction(id, user, request) {
    const rt = await this.getRecurringTransaction(id, user);

    const isOwner = rt.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && rt.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        isGroupAdmin = rt.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to update this recurring transaction");
    }

    const category = await categoryRepository.findById(request.categoryId || request.category_id);
    if (!category) throw new Error('Category not found');

    const account = await accountRepository.findById(request.accountId || request.account_id);
    if (!account) throw new Error('Account not found');

    const recurrenceType = request.recurrenceType || request.recurrence_type;
    const startDate = request.startDate || request.start_date;

    const fieldsToUpdate = {
      description: request.description,
      amount: request.amount,
      type: request.type,
      recurrenceType,
      startDate,
      endDate: request.endDate || request.end_date || null,
      notes: request.notes,
      categoryId: category.id,
      accountId: account.id,
    };

    if (rt.recurrence_type !== recurrenceType) {
      fieldsToUpdate.nextDueDate = this.calculateNextDueDate(startDate, recurrenceType);
    }

    return await recurringTransactionRepository.update(id, fieldsToUpdate);
  }

  async deleteRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);

    const isOwner = rt.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && rt.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        isGroupAdmin = rt.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to delete this recurring transaction");
    }

    await recurringTransactionRepository.delete(id);
  }

  async toggleRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);

    const isOwner = rt.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && rt.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        isGroupAdmin = rt.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to toggle this recurring transaction");
    }

    const newActiveState = !rt.is_active;
    return await recurringTransactionRepository.update(id, { isActive: newActiveState });
  }

  async executeRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);

    if (!rt.is_active) {
      throw new Error('Cannot execute inactive recurring transaction');
    }

    const today = new Date().toISOString().split('T')[0];

    // Create transaction
    await transactionRepository.create({
      amount: rt.amount,
      description: rt.description,
      type: rt.type,
      transactionDate: today,
      notes: rt.notes,
      userId: rt.user_id,
      categoryId: rt.category_id,
      accountId: rt.account_id,
      recurringTransactionId: rt.id,
    });

    // Update account balance
    await accountRepository.updateBalance(rt.account_id, rt.amount, rt.type);

    // Calculate next due date
    const nextDueDate = this.calculateNextDueDate(rt.next_due_date || today, rt.recurrence_type);

    let isActive = true;
    if (rt.end_date && nextDueDate > rt.end_date) {
      isActive = false;
    }

    await recurringTransactionRepository.update(rt.id, {
      nextDueDate,
      isActive,
    });
  }

  async processDueRecurringTransactions() {
    const today = new Date().toISOString().split('T')[0];
    const dueTransactions = await recurringTransactionRepository.findAllDue(today);

    console.log(`[RecurringService] Found ${dueTransactions.length} due recurring transactions to process`);

    for (const rt of dueTransactions) {
      try {
        const owner = { id: rt.user_id };
        await this.executeRecurringTransaction(rt.id, owner);
        console.log(`[RecurringService] Processed recurring transaction ID: ${rt.id}`);
      } catch (err) {
        console.error(`[RecurringService] Error processing recurring transaction ID ${rt.id}:`, err.message);
      }
    }
  }
}

module.exports = new RecurringTransactionService();

