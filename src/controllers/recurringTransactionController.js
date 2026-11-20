const recurringTransactionService = require('../services/recurringTransactionService');
const { toDateStr } = require('../utils/dateUtil');

const formatRecurringTransactionDto = (rt) => {
  if (!rt) return null;
  return {
    id: rt.id,
    description: rt.description,
    amount: rt.amount != null ? parseFloat(rt.amount) : 0,
    type: rt.type,
    recurrenceType: rt.recurrence_type || rt.recurrenceType,
    // Plain 'YYYY-MM-DD' strings: no time zone shifting between server and browser.
    startDate: toDateStr(rt.start_date || rt.startDate),
    endDate: toDateStr(rt.end_date || rt.endDate),
    nextDueDate: toDateStr(rt.next_due_date || rt.nextDueDate),
    notes: rt.notes,
    isActive: rt.is_active !== undefined ? !!rt.is_active : (rt.isActive !== undefined ? !!rt.isActive : true),
    createdAt: rt.created_at || rt.createdAt,
    updatedAt: rt.updated_at || rt.updatedAt,
    categoryId: rt.category_id || (rt.category && rt.category.id),
    categoryName: rt.category_name || (rt.category && rt.category.name),
    accountId: rt.account_id || (rt.account && rt.account.id),
    accountName: rt.account_name || (rt.account && rt.account.name),
  };
};

class RecurringTransactionController {
  async getAllRecurringTransactions(req, res, next) {
    try {
      const list = await recurringTransactionService.getAllRecurringTransactions(req.user);
      res.json(list.map(formatRecurringTransactionDto));
    } catch (err) {
      next(err);
    }
  }

  async getActiveRecurringTransactions(req, res, next) {
    try {
      const list = await recurringTransactionService.getActiveRecurringTransactions(req.user);
      res.json(list.map(formatRecurringTransactionDto));
    } catch (err) {
      next(err);
    }
  }

  async getRecurringTransaction(req, res, next) {
    try {
      const rt = await recurringTransactionService.getRecurringTransaction(req.params.id, req.user);
      res.json(formatRecurringTransactionDto(rt));
    } catch (err) {
      next(err);
    }
  }

  async createRecurringTransaction(req, res, next) {
    try {
      const rt = await recurringTransactionService.createRecurringTransaction(req.user, req.body);
      const fullRt = await recurringTransactionService.getRecurringTransaction(rt.id, req.user);
      res.status(201).json(formatRecurringTransactionDto(fullRt || rt));
    } catch (err) {
      next(err);
    }
  }

  async updateRecurringTransaction(req, res, next) {
    try {
      const rt = await recurringTransactionService.updateRecurringTransaction(req.params.id, req.user, req.body);
      const fullRt = await recurringTransactionService.getRecurringTransaction(req.params.id, req.user);
      res.json(formatRecurringTransactionDto(fullRt || rt));
    } catch (err) {
      next(err);
    }
  }

  async deleteRecurringTransaction(req, res, next) {
    try {
      await recurringTransactionService.deleteRecurringTransaction(req.params.id, req.user);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  async toggleRecurringTransaction(req, res, next) {
    try {
      const rt = await recurringTransactionService.toggleRecurringTransaction(req.params.id, req.user);
      const fullRt = await recurringTransactionService.getRecurringTransaction(req.params.id, req.user);
      res.json(formatRecurringTransactionDto(fullRt || rt));
    } catch (err) {
      next(err);
    }
  }

  async executeRecurringTransaction(req, res, next) {
    try {
      const result = await recurringTransactionService.executeRecurringTransaction(req.params.id, req.user);
      res.status(200).json({
        success: true,
        created: result.created,
        nextDueDate: result.nextDueDate,
        isActive: result.isActive,
      });
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new RecurringTransactionController();

