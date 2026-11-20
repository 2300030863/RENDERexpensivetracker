const transactionRepository = require('../repositories/transactionRepository');
const categoryRepository = require('../repositories/categoryRepository');
const accountRepository = require('../repositories/accountRepository');
const recurringTransactionRepository = require('../repositories/recurringTransactionRepository');
const adminRepository = require('../repositories/adminRepository');
const userRepository = require('../repositories/userRepository');
const accountService = require('./accountService');
const categoryService = require('./categoryService');
const { badRequest } = require('../utils/httpError');
const { isValidDateStr, toDateStr } = require('../utils/dateUtil');

const MAX_AMOUNT = 99999999.99; // DECIMAL(10,2)

function parseTransactionInput(request) {
  const amountRaw = Number(request.amount);
  if (!Number.isFinite(amountRaw) || amountRaw <= 0) throw badRequest('Amount must be greater than 0');
  if (amountRaw > MAX_AMOUNT) throw badRequest('Amount is too large');

  const type = typeof request.type === 'string' ? request.type.toUpperCase() : '';
  if (type !== 'INCOME' && type !== 'EXPENSE') throw badRequest('Type must be INCOME or EXPENSE');

  const description = typeof request.description === 'string' ? request.description.trim() : '';
  if (!description || description.length > 200) throw badRequest('Description is required (max 200 characters)');

  const dateRaw = request.transactionDate || request.transaction_date;
  const transactionDate = typeof dateRaw === 'string' ? dateRaw.slice(0, 10) : toDateStr(dateRaw);
  if (!isValidDateStr(transactionDate)) throw badRequest('A valid transaction date is required');

  const notes = typeof request.notes === 'string' ? request.notes.trim() : '';
  if (notes.length > 500) throw badRequest('Notes must be 500 characters or fewer');

  return {
    amount: Math.round(amountRaw * 100) / 100,
    type,
    description,
    transactionDate,
    notes,
  };
}

async function requireVisibleAccount(user, accountId) {
  const id = Number(accountId);
  const accounts = await accountService.getAllAccounts(user);
  const account = accounts.find((a) => Number(a.id) === id);
  if (!account) throw badRequest('Account not found');
  return account;
}

async function requireVisibleCategory(user, categoryId) {
  const id = Number(categoryId);
  const categories = await categoryService.getAllCategories(user);
  const category = categories.find((c) => Number(c.id) === id);
  if (!category) throw badRequest('Category not found');
  return category;
}

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
    const input = parseTransactionInput(request);

    // Only categories/accounts this user is allowed to use (blocks posting to other people's accounts)
    const category = await requireVisibleCategory(user, request.categoryId || request.category_id);
    const account = await requireVisibleAccount(user, request.accountId || request.account_id);

    const amount = input.amount;
    const type = input.type;

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
      description: input.description,
      type,
      transactionDate: input.transactionDate,
      notes: input.notes,
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

    // Validate everything first so a bad request can never leave balances half-changed
    const input = parseTransactionInput(request);
    const newCategory = await requireVisibleCategory(user, request.categoryId || request.category_id);
    const newAccount = await requireVisibleAccount(user, request.accountId || request.account_id);

    // Revert old transaction's impact on old account
    const oldAccount = await accountRepository.findById(transaction.account_id);
    if (oldAccount) {
      const revertType = transaction.type === 'EXPENSE' ? 'INCOME' : 'EXPENSE';
      await accountRepository.updateBalance(oldAccount.id, transaction.amount, revertType);
    }

    const amount = input.amount;
    const type = input.type;

    // Check balance if EXPENSE (re-read: the revert above may have changed this account's balance)
    if (type === 'EXPENSE') {
      const refreshed = await accountRepository.findById(newAccount.id);
      const updatedBalance = parseFloat((refreshed || newAccount).balance || 0);
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
      description: input.description,
      type,
      transactionDate: input.transactionDate,
      notes: input.notes,
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

