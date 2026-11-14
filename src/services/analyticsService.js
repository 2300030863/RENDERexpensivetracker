const transactionRepository = require('../repositories/transactionRepository');
const budgetRepository = require('../repositories/budgetRepository');
const userRepository = require('../repositories/userRepository');
const adminRepository = require('../repositories/adminRepository');

class AnalyticsService {
  async getDashboardData(user, startDate, endDate) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    const isOwner = fullUser.role === 'ROLE_OWNER';
    const isAdmin = fullUser.role === 'ROLE_ADMIN';
    const isInUserGroup = !!fullUser.user_group_id;

    let totalIncome = 0;
    let totalExpenses = 0;
    let categorySpending = [];
    let monthlyTrend = [];

    if (isOwner) {
      totalIncome = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
        fullUser.id, 'INCOME', startDate, endDate
      );
      totalExpenses = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
      categorySpending = await transactionRepository.getCategoryWiseSpending(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
      monthlyTrend = await transactionRepository.getMonthlyTrend(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
    } else if (isAdmin) {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        const allTransactions = await transactionRepository.findByAdminManagedUsersAndDateRange(
          fullUser.id, admin.id, startDate, endDate
        );

        totalIncome = allTransactions
          .filter(t => t.type === 'INCOME')
          .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        totalExpenses = allTransactions
          .filter(t => t.type === 'EXPENSE')
          .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        const categoryMap = new Map();
        allTransactions
          .filter(t => t.type === 'EXPENSE')
          .forEach(t => {
            const catName = t.category_name || 'Other';
            categoryMap.set(catName, (categoryMap.get(catName) || 0) + parseFloat(t.amount || 0));
          });
        categorySpending = Array.from(categoryMap.entries()).map(([k, v]) => [k, v]);

        monthlyTrend = await transactionRepository.getMonthlyTrendByAdminManagedUsers(
          fullUser.id, admin.id, 'EXPENSE', startDate, endDate
        );
      } else {
        totalIncome = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
          fullUser.id, 'INCOME', startDate, endDate
        );
        totalExpenses = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
          fullUser.id, 'EXPENSE', startDate, endDate
        );
        categorySpending = await transactionRepository.getCategoryWiseSpending(
          fullUser.id, 'EXPENSE', startDate, endDate
        );
        monthlyTrend = await transactionRepository.getMonthlyTrend(
          fullUser.id, 'EXPENSE', startDate, endDate
        );
      }
    } else if (isInUserGroup) {
      const groupId = fullUser.user_group_id;
      totalIncome = await transactionRepository.sumAmountByUserGroupAndTypeAndDateRange(
        groupId, 'INCOME', startDate, endDate
      );
      totalExpenses = await transactionRepository.sumAmountByUserGroupAndTypeAndDateRange(
        groupId, 'EXPENSE', startDate, endDate
      );
      categorySpending = await transactionRepository.getCategoryWiseSpendingByUserGroup(
        groupId, 'EXPENSE', startDate, endDate
      );
      monthlyTrend = await transactionRepository.getMonthlyTrendByUserGroup(
        groupId, 'EXPENSE', startDate, endDate
      );
    } else {
      totalIncome = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
        fullUser.id, 'INCOME', startDate, endDate
      );
      totalExpenses = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
      categorySpending = await transactionRepository.getCategoryWiseSpending(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
      monthlyTrend = await transactionRepository.getMonthlyTrend(
        fullUser.id, 'EXPENSE', startDate, endDate
      );
    }

    return {
      totalIncome: Math.round(totalIncome * 100) / 100,
      totalExpenses: Math.round(totalExpenses * 100) / 100,
      netAmount: Math.round((totalIncome - totalExpenses) * 100) / 100,
      categorySpending,
      monthlyTrend,
    };
  }

  async getCategorySpending(user, startDate, endDate) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    const isAdmin = fullUser.role === 'ROLE_ADMIN';
    const isOwner = fullUser.role === 'ROLE_OWNER';

    if (isOwner) {
      return await transactionRepository.getCategoryWiseSpending(fullUser.id, 'EXPENSE', startDate, endDate);
    }

    if (isAdmin) {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        const allTransactions = await transactionRepository.findByAdminManagedUsersAndDateRange(
          fullUser.id, admin.id, startDate, endDate
        );
        const categoryMap = new Map();
        allTransactions
          .filter(t => t.type === 'EXPENSE')
          .forEach(t => {
            const catName = t.category_name || 'Other';
            categoryMap.set(catName, (categoryMap.get(catName) || 0) + parseFloat(t.amount || 0));
          });
        return Array.from(categoryMap.entries()).map(([k, v]) => [k, v]);
      }
    }

    if (fullUser.user_group_id) {
      return await transactionRepository.getCategoryWiseSpendingByUserGroup(
        fullUser.user_group_id, 'EXPENSE', startDate, endDate
      );
    }

    return await transactionRepository.getCategoryWiseSpending(fullUser.id, 'EXPENSE', startDate, endDate);
  }

  async getMonthlyTrend(user, startDate, endDate) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    const isOwner = fullUser.role === 'ROLE_OWNER';
    const isAdmin = fullUser.role === 'ROLE_ADMIN';

    if (isOwner) {
      return await transactionRepository.getMonthlyTrend(fullUser.id, 'EXPENSE', startDate, endDate);
    }

    if (isAdmin) {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        return await transactionRepository.getMonthlyTrendByAdminManagedUsers(
          fullUser.id, admin.id, 'EXPENSE', startDate, endDate
        );
      }
    }

    if (fullUser.user_group_id) {
      return await transactionRepository.getMonthlyTrendByUserGroup(
        fullUser.user_group_id, 'EXPENSE', startDate, endDate
      );
    }

    return await transactionRepository.getMonthlyTrend(fullUser.id, 'EXPENSE', startDate, endDate);
  }

  async getBudgetStatus(user) {
    const today = new Date().toISOString().split('T')[0];
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    const isAdmin = fullUser.role === 'ROLE_ADMIN';
    const isOwner = fullUser.role === 'ROLE_OWNER';
    const isInUserGroup = !!fullUser.user_group_id;

    let activeBudgets = [];
    if (isInUserGroup) {
      activeBudgets = await budgetRepository.findActiveBudgetsForGroupAndDate(fullUser.user_group_id, today);
    } else {
      activeBudgets = await budgetRepository.findActiveBudgetsForDate(fullUser.id, today);
    }

    const budgetStatus = [];

    for (const b of activeBudgets) {
      const startDate = b.start_date;
      const endDate = b.end_date;
      const budgetAmount = parseFloat(b.amount || 0);
      const alertThreshold = b.alert_threshold || 80;

      let spent = 0;

      if (isOwner) {
        if (b.category_id) {
          spent = await transactionRepository.sumAmountByUserAndTypeAndCategoryAndDateRange(
            fullUser.id, 'EXPENSE', b.category_id, startDate, endDate
          );
        } else {
          spent = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
            fullUser.id, 'EXPENSE', startDate, endDate
          );
        }
      } else if (isAdmin) {
        const admin = await adminRepository.findByUsername(fullUser.username);
        if (admin) {
          const allTxns = await transactionRepository.findByAdminManagedUsersAndDateRange(
            fullUser.id, admin.id, startDate, endDate
          );
          spent = allTxns
            .filter(t => t.type === 'EXPENSE' && (!b.category_id || t.category_id === b.category_id))
            .reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        } else {
          if (b.category_id) {
            spent = await transactionRepository.sumAmountByUserAndTypeAndCategoryAndDateRange(
              fullUser.id, 'EXPENSE', b.category_id, startDate, endDate
            );
          } else {
            spent = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
              fullUser.id, 'EXPENSE', startDate, endDate
            );
          }
        }
      } else if (isInUserGroup) {
        const groupId = fullUser.user_group_id;
        if (b.category_id) {
          spent = await transactionRepository.sumAmountByUserGroupAndTypeAndCategoryAndDateRange(
            groupId, 'EXPENSE', b.category_id, startDate, endDate
          );
        } else {
          spent = await transactionRepository.sumAmountByUserGroupAndTypeAndDateRange(
            groupId, 'EXPENSE', startDate, endDate
          );
        }
      } else {
        if (b.category_id) {
          spent = await transactionRepository.sumAmountByUserAndTypeAndCategoryAndDateRange(
            fullUser.id, 'EXPENSE', b.category_id, startDate, endDate
          );
        } else {
          spent = await transactionRepository.sumAmountByUserAndTypeAndDateRange(
            fullUser.id, 'EXPENSE', startDate, endDate
          );
        }
      }

      spent = Math.round(spent * 100) / 100;
      const remaining = Math.round((budgetAmount - spent) * 100) / 100;
      const percentage = budgetAmount > 0 ? Math.round((spent / budgetAmount) * 10000) / 100 : 0;
      const isOverBudget = spent > budgetAmount;
      const isNearLimit = percentage >= alertThreshold;

      const formatSafeDate = (d) => {
        if (!d) return null;
        if (d instanceof Date) return d.toISOString().split('T')[0];
        if (typeof d === 'string') return d.split('T')[0];
        return d;
      };

      budgetStatus.push({
        budget: {
          id: b.id,
          amount: budgetAmount,
          startDate: formatSafeDate(b.start_date),
          endDate: formatSafeDate(b.end_date),
          type: b.type,
          alertThreshold: b.alert_threshold,
          isActive: !!b.is_active,
          categoryId: b.category_id,
          categoryName: b.category_name,
          category: b.category_id ? {
            id: b.category_id,
            name: b.category_name,
            color: b.category_color,
          } : null,
        },
        spent,
        remaining,
        percentage,
        isOverBudget,
        isNearLimit,
      });
    }

    return budgetStatus;
  }
}

module.exports = new AnalyticsService();

