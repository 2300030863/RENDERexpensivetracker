const budgetService = require('../services/budgetService');

const formatSafeDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().split('T')[0];
  if (typeof d === 'string') return d.split('T')[0];
  return d;
};

const formatBudget = (b) => {
  if (!b) return null;
  return {
    id: b.id,
    amount: b.amount != null ? parseFloat(b.amount) : 0,
    startDate: formatSafeDate(b.start_date || b.startDate),
    endDate: formatSafeDate(b.end_date || b.endDate),
    type: b.type || 'MONTHLY',
    alertThreshold: b.alert_threshold != null ? parseFloat(b.alert_threshold) : (b.alertThreshold != null ? parseFloat(b.alertThreshold) : 80),
    isActive: b.is_active !== undefined ? !!b.is_active : (b.isActive !== undefined ? !!b.isActive : true),
    category: b.category_id ? {
      id: b.category_id,
      name: b.category_name,
      color: b.category_color,
    } : (b.category || null),
    user: (b.user_owner_id || b.user_id) ? {
      id: b.user_owner_id || b.user_id,
      username: b.user_owner_username || b.username || undefined,
    } : (b.user || null),
    userGroup: b.user_group_id ? {
      id: b.user_group_id,
      name: b.user_group_name || undefined,
    } : (b.userGroup || null),
  };
};

class BudgetController {
  async getAllBudgets(req, res, next) {
    try {
      const budgets = await budgetService.getAllBudgets(req.user);
      res.json(budgets.map(formatBudget));
    } catch (err) {
      next(err);
    }
  }

  async getBudget(req, res, next) {
    try {
      const budget = await budgetService.getBudget(req.user, req.params.id);
      res.json(formatBudget(budget));
    } catch (err) {
      next(err);
    }
  }

  async createBudget(req, res, next) {
    try {
      const budget = await budgetService.createBudget(req.user, req.body);
      res.status(201).json(formatBudget(budget));
    } catch (err) {
      next(err);
    }
  }

  async updateBudget(req, res, next) {
    try {
      const budget = await budgetService.updateBudget(req.user, req.params.id, req.body);
      res.json(formatBudget(budget));
    } catch (err) {
      next(err);
    }
  }

  async deleteBudget(req, res, next) {
    try {
      await budgetService.deleteBudget(req.user, req.params.id);
      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new BudgetController();
