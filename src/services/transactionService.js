const transactionRepository = require('../repositories/transactionRepository');
const categoryRepository = require('../repositories/categoryRepository');
const accountRepository = require('../repositories/accountRepository');
const recurringTransactionRepository = require('../repositories/recurringTransactionRepository');
const adminRepository = require('../repositories/adminRepository');
const userRepository = require('../repositories/userRepository');

class TransactionService {
  async getAllTransactions(user, page = 0, size = 10) {
    const limit = parseInt(size, 10) || 10;
    const pageNum = parseInt(page, 10) || 0;
    const offset = pageNum * limit;

    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    let result;

    if (fullUser.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        result = await transactionRepository.findByAdminManagedUsersPaginated(fullUser.id, admin.id, limit, offset);
      } else {
        result = await transactionRepository.findByUserPaginated(fullUser.id, limit, offset);
      }
    } else if (fullUser.user_group_id) {
      result = await transactionRepository.findByUserGroupPaginated(fullUser.user_group_id, limit, offset);
    } else {
      result = await transactionRepository.findByUserPaginated(fullUser.id, limit, offset);
    }

    const totalElements = result.total;
    const totalPages = Math.ceil(totalElements / limit);

    return {
      content: result.content,
      totalElements,
      totalPages,
      number: pageNum,
      size: limit,
      first: pageNum === 0,
      last: pageNum >= totalPages - 1,
      empty: result.content.length === 0,
    };
  }

  async searchTransactions(user, startDate, endDate, categoryId, accountId) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    let start = startDate;
    let end = endDate;

    if (!start) {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      start = d.toISOString().split('T')[0];
    }
    if (!end) {
      end = new Date().toISOString().split('T')[0];
    }

    if (fullUser.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        return await transactionRepository.searchByAdminManagedUsers(fullUser.id, admin.id, start, end, categoryId, accountId);
      } else {
        return await transactionRepository.searchByUser(fullUser.id, start, end, categoryId, accountId);
      }
    }

    if (fullUser.user_group_id) {
      return await transactionRepository.searchByUserGroup(fullUser.user_group_id, start, end, categoryId, accountId);
    }

    return await transactionRepository.searchByUser(fullUser.id, start, end, categoryId, accountId);
  }

  async getTransaction(user, id) {
    const transaction = await transactionRepository.findById(id);
    if (!transaction) throw new Error('Transaction not found');

    // Owner allowed
    if (transaction.user_id === user.id) return transaction;

    // Admin allowed if manages transaction's user
    if (user.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const txnUser = await userRepository.findByIdWithUserGroup(transaction.user_id);
        if (txnUser && (txnUser.admin_id === admin.id || txnUser.group_admin_id === admin.id)) {
          return transaction;
        }
      }
    }

    // Same group allowed
    const currentUser = await userRepository.findByIdWithUserGroup(user.id);
    const txnUser = await userRepository.findByIdWithUserGroup(transaction.user_id);
    if (currentUser && currentUser.user_group_id && txnUser && txnUser.user_group_id) {
      if (currentUser.user_group_id === txnUser.user_group_id) {
        return transaction;
      }
    }

    throw new Error('Transaction not found');
  }

  async createTransaction(user, request) {
    const category = await categoryRepository.findById(request.categoryId || request.category_id);
    if (!category) throw new Error('Category not found');

    const account = await accountRepository.findById(request.accountId || request.account_id);
    if (!account) throw new Error('Account not found');

    const amount = parseFloat(request.amount);
    const type = request.type;

    // Balance check for EXPENSE
    if (type === 'EXPENSE') {
      const currentBalance = parseFloat(account.balance || 0);
      if (currentBalance < amount) {
        throw new Error(`Insufficient balance in account. Available balance: ${currentBalance}`);
      }
    }

    if (request.recurringTransactionId) {
      const rt = await recurringTransactionRepository.findById(request.recurringTransactionId);
      if (!rt) throw new Error('Recurring transaction not found');
    }

    const created = await transactionRepository.create({
      amount,
      description: request.description,
      type,
      transactionDate: request.transactionDate || request.transaction_date,
      notes: request.notes,
      userId: user.id,
      categoryId: category.id,
      accountId: account.id,
      recurringTransactionId: request.recurringTransactionId || null,
      adminId: user.admin_id || null,
    });

    // Update account balance
    await accountRepository.updateBalance(account.id, amount, type);

    return await transactionRepository.findById(created.id);
  }

  async updateTransaction(user, id, request) {
    const transaction = await this.getTransaction(user, id);

    // Permission check
    const isOwner = transaction.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && transaction.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        isGroupAdmin = transaction.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to update this transaction");
    }

    // Revert old transaction's impact on old account
    const oldAccount = await accountRepository.findById(transaction.account_id);
    if (oldAccount) {
      const revertType = transaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
      await accountRepository.updateBalance(oldAccount.id, transaction.amount, revertType);
    }

    const newCategory = await categoryRepository.findById(request.categoryId || request.category_id);
    if (!newCategory) throw new Error('Category not found');

    const newAccount = await accountRepository.findById(request.accountId || request.account_id);
    if (!newAccount) throw new Error('Account not found');

    const amount = parseFloat(request.amount);
    const type = request.type;

    // Check balance if EXPENSE
    if (type === 'EXPENSE') {
      const updatedBalance = parseFloat(newAccount.balance || 0);
      if (updatedBalance < amount) {
        // Rollback old account revert first
        if (oldAccount) {
          await accountRepository.updateBalance(oldAccount.id, transaction.amount, transaction.type);
        }
        throw new Error(`Insufficient balance in account. Available balance: ${updatedBalance}`);
      }
    }

    await transactionRepository.update(id, {
      amount,
      description: request.description,
      type,
      transactionDate: request.transactionDate || request.transaction_date,
      notes: request.notes,
      categoryId: newCategory.id,
      accountId: newAccount.id,
      recurringTransactionId: request.recurringTransactionId || null,
    });

    // Apply new transaction's impact on new account
    await accountRepository.updateBalance(newAccount.id, amount, type);

    return await transactionRepository.findById(id);
  }

  async deleteTransaction(user, id) {
    const transaction = await this.getTransaction(user, id);

    const isOwner = transaction.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && transaction.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        isGroupAdmin = transaction.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to delete this transaction");
    }

    // Revert account balance
    const account = await accountRepository.findById(transaction.account_id);
    if (account) {
      const revertType = transaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
      await accountRepository.updateBalance(account.id, transaction.amount, revertType);
    }

    await transactionRepository.delete(id);
  }
}

module.exports = new TransactionService();

