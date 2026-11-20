const recurringTransactionRepository = require('../repositories/recurringTransactionRepository');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');
const userGroupRepository = require('../repositories/userGroupRepository');
const accountService = require('./accountService');
const categoryService = require('./categoryService');
const { badRequest, forbidden, notFound } = require('../utils/httpError');
const {
  todayInAppTz,
  toDateStr,
  isValidDateStr,
  addDays,
  addPeriod,
  advanceToOnOrAfter,
} = require('../utils/dateUtil');

const RECURRENCE_TYPES = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
const TRANSACTION_TYPES = ['INCOME', 'EXPENSE'];
const MAX_AMOUNT = 99999999.99; // DECIMAL(10,2)

const pick = (body, camel, snake) => (body[camel] !== undefined ? body[camel] : body[snake]);
const toId = (value) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
};

class RecurringTransactionService {
  /** Kept for backwards compatibility with older callers. */
  calculateNextDueDate(currentDateStr, recurrenceType) {
    const date = toDateStr(currentDateStr);
    if (!date) throw badRequest('Invalid date');
    return addPeriod(date, recurrenceType, Number(date.slice(8, 10)));
  }

  /**
   * Validate and normalise a create/update payload. Never trust the client:
   * every field is type-checked and range-checked here.
   */
  validateInput(body = {}, { isCreate }) {
    const description = typeof body.description === 'string' ? body.description.trim() : '';
    if (description.length < 3 || description.length > 200) {
      throw badRequest('Description must be between 3 and 200 characters');
    }

    const amountRaw = Number(body.amount);
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      throw badRequest('Amount must be greater than 0');
    }
    if (amountRaw > MAX_AMOUNT) {
      throw badRequest('Amount is too large');
    }
    const amount = Math.round(amountRaw * 100) / 100;

    const type = typeof body.type === 'string' ? body.type.toUpperCase() : '';
    if (!TRANSACTION_TYPES.includes(type)) {
      throw badRequest('Type must be INCOME or EXPENSE');
    }

    const recurrenceTypeRaw = pick(body, 'recurrenceType', 'recurrence_type');
    const recurrenceType = typeof recurrenceTypeRaw === 'string' ? recurrenceTypeRaw.toUpperCase() : '';
    if (!RECURRENCE_TYPES.includes(recurrenceType)) {
      throw badRequest('Repeat cycle must be DAILY, WEEKLY, MONTHLY or YEARLY');
    }

    const startDate = pick(body, 'startDate', 'start_date');
    if (!isValidDateStr(startDate)) {
      throw badRequest('Start date is required and must be a valid date (YYYY-MM-DD)');
    }
    if (isCreate && startDate < addDays(todayInAppTz(), -1)) {
      throw badRequest('Start date cannot be in the past');
    }

    let endDate = pick(body, 'endDate', 'end_date');
    if (endDate === '' || endDate === undefined) endDate = null;
    if (endDate !== null) {
      if (!isValidDateStr(endDate)) {
        throw badRequest('End date must be a valid date (YYYY-MM-DD)');
      }
      if (endDate < startDate) {
        throw badRequest('End date must be on or after the start date');
      }
    }

    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';
    if (notes.length > 500) {
      throw badRequest('Notes must be 500 characters or fewer');
    }

    const categoryId = toId(pick(body, 'categoryId', 'category_id'));
    if (!categoryId) throw badRequest('Category is required');

    const accountId = toId(pick(body, 'accountId', 'account_id'));
    if (!accountId) throw badRequest('Account is required');

    return { description, amount, type, recurrenceType, startDate, endDate, notes, categoryId, accountId };
  }

  /** The account must be one this user is allowed to see (own, group, or managed). */
  async assertAccountUsable(user, accountId) {
    const accounts = await accountService.getAllAccounts(user);
    const account = accounts.find((a) => Number(a.id) === accountId);
    if (!account) throw badRequest('Account not found');
    return account;
  }

  /** Same rule for categories: default categories plus the ones this user may see. */
  async assertCategoryUsable(user, categoryId) {
    const categories = await categoryService.getAllCategories(user);
    const category = categories.find((c) => Number(c.id) === categoryId);
    if (!category) throw badRequest('Category not found');
    return category;
  }

  async canManage(rt, user) {
    if (Number(rt.user_id) === Number(user.id)) return true;
    if (user.role === 'ROLE_OWNER') return true;
    if (user.role === 'ROLE_ADMIN' && rt.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      return Boolean(admin) && Number(rt.group_admin_id) === Number(admin.id);
    }
    return false;
  }

  async assertCanManage(rt, user, action) {
    if (!(await this.canManage(rt, user))) {
      throw forbidden(`Access denied: You don't have permission to ${action} this recurring transaction`);
    }
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
      return await recurringTransactionRepository.findByUserGroupAndIsActiveTrueOrderByNextDueDateAsc(
        fullUser.user_group_id
      );
    }
    return await recurringTransactionRepository.findByUserAndIsActiveTrueOrderByNextDueDateAsc(fullUser.id);
  }

  async getRecurringTransaction(id, user) {
    const rt = await recurringTransactionRepository.findById(id);
    if (!rt) throw notFound('Recurring transaction not found');

    if (Number(rt.user_id) === Number(user.id)) return rt;

    const currentUser = await userRepository.findByIdWithUserGroup(user.id);
    if (currentUser && currentUser.user_group_id && rt.user_group_id) {
      if (Number(currentUser.user_group_id) === Number(rt.user_group_id)) {
        return rt;
      }
    }

    // Same message as "does not exist" so IDs of other people's schedules cannot be probed.
    throw notFound('Recurring transaction not found');
  }

  async createRecurringTransaction(user, request) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    // Group members cannot create schedules; only the group's admin can
    if (fullUser && fullUser.user_group_id && user.role !== 'ROLE_OWNER') {
      const admin = await adminRepository.findByUsername(user.username);
      let isGroupAdmin = false;
      if (admin) {
        const groups = await userGroupRepository.findByAdmin(admin.id);
        isGroupAdmin = groups.some((g) => Number(g.id) === Number(fullUser.user_group_id));
      }
      if (!isGroupAdmin) {
        throw forbidden(
          'Access denied: Group members cannot create recurring transactions. Only group admins can create recurring transactions.'
        );
      }
    }

    const input = this.validateInput(request, { isCreate: true });
    const category = await this.assertCategoryUsable(user, input.categoryId);
    const account = await this.assertAccountUsable(user, input.accountId);

    // The first posting happens ON the start date (not one period later).
    return await recurringTransactionRepository.create({
      description: input.description,
      amount: input.amount,
      type: input.type,
      recurrenceType: input.recurrenceType,
      startDate: input.startDate,
      endDate: input.endDate,
      nextDueDate: input.startDate,
      notes: input.notes,
      userId: user.id,
      categoryId: category.id,
      accountId: account.id,
    });
  }

  async updateRecurringTransaction(id, user, request) {
    const rt = await this.getRecurringTransaction(id, user);
    await this.assertCanManage(rt, user, 'update');

    const input = this.validateInput(request, { isCreate: false });

    if (input.categoryId !== Number(rt.category_id)) {
      await this.assertCategoryUsable(user, input.categoryId);
    }
    if (input.accountId !== Number(rt.account_id)) {
      await this.assertAccountUsable(user, input.accountId);
    }

    const fields = {
      description: input.description,
      amount: input.amount,
      type: input.type,
      recurrenceType: input.recurrenceType,
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      categoryId: input.categoryId,
      accountId: input.accountId,
    };

    // If the timing changed, work out the next due date again - but never back-date it,
    // otherwise saving an edit would post a pile of missed occurrences.
    const startChanged = input.startDate !== toDateStr(rt.start_date);
    const cycleChanged = input.recurrenceType !== rt.recurrence_type;
    let effectiveNextDue = toDateStr(rt.next_due_date) || input.startDate;
    if (startChanged || cycleChanged) {
      effectiveNextDue = advanceToOnOrAfter(
        input.startDate,
        input.recurrenceType,
        Number(input.startDate.slice(8, 10)),
        todayInAppTz()
      );
      fields.nextDueDate = effectiveNextDue;
    }

    // An end date that is already behind the next occurrence means the schedule is finished.
    if (input.endDate && effectiveNextDue > input.endDate && (rt.is_active === 1 || rt.is_active === true)) {
      fields.isActive = false;
    }

  }

  async deleteRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);
    await this.assertCanManage(rt, user, 'delete');
    await recurringTransactionRepository.delete(id);
  }

  async toggleRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);
    await this.assertCanManage(rt, user, 'toggle');

    const isActive = rt.is_active === 1 || rt.is_active === true;
    if (isActive) {
      return await recurringTransactionRepository.update(id, { isActive: false });
    }

    // Resuming: skip the occurrences that fell inside the paused period instead of
    // charging for all of them at once.
    const startStr = toDateStr(rt.start_date);
    const today = todayInAppTz();
    const nextDue = advanceToOnOrAfter(
      toDateStr(rt.next_due_date) || startStr,
      rt.recurrence_type,
      Number(startStr.slice(8, 10)),
      today
    );
    const endStr = toDateStr(rt.end_date);
    if (endStr && nextDue > endStr) {
      throw badRequest('This schedule has reached its end date. Extend the end date before resuming it.');
    }
    return await recurringTransactionRepository.update(id, { isActive: true, nextDueDate: nextDue });
  }

  /** Manual "run now": posts one occurrence dated today. */
  async executeRecurringTransaction(id, user) {
    const rt = await this.getRecurringTransaction(id, user);
    await this.assertCanManage(rt, user, 'execute');
    return await recurringTransactionRepository.processOccurrences(rt.id, {
      today: todayInAppTz(),
      manual: true,
    });
  }

  /** Called by the scheduler: posts everything that has become due. */
  async processDueRecurringTransactions() {
    const today = todayInAppTz();
    const dueIds = await recurringTransactionRepository.findDueIds(today);

    const summary = { checked: dueIds.length, posted: 0, blocked: 0, failed: 0 };
    if (dueIds.length === 0) return summary;
    console.log(`[RecurringService] ${dueIds.length} schedule(s) due on or before ${today}`);

    for (const id of dueIds) {
      try {
        const result = await recurringTransactionRepository.processOccurrences(id, { today, manual: false });
        summary.posted += result.created;
        if (result.blocked) {
          summary.blocked += 1;
          console.warn(`[RecurringService] Schedule ${id} is waiting: ${result.blocked}`);
        }
      } catch (err) {
        summary.failed += 1;
        console.error(`[RecurringService] Schedule ${id} failed:`, err.message);
      }
    }

    console.log(
      `[RecurringService] Done: ${summary.posted} posted, ${summary.blocked} waiting, ${summary.failed} failed`
    );
    return summary;
  }
}

module.exports = new RecurringTransactionService();
