const budgetRepository = require('../repositories/budgetRepository');
const categoryRepository = require('../repositories/categoryRepository');
const adminRepository = require('../repositories/adminRepository');
const userRepository = require('../repositories/userRepository');

class BudgetService {
  async getAllBudgets(user) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!fullUser) return [];

    if (fullUser.user_group_id) {
      return await budgetRepository.findByUserGroupAndIsActiveTrueOrderByStartDateDesc(fullUser.user_group_id);
    }
    return await budgetRepository.findByUserAndIsActiveTrueOrderByStartDateDesc(fullUser.id);
  }

  async getBudget(user, id) {
    const budget = await budgetRepository.findById(id);
    if (!budget) throw new Error('Budget not found');

    if (budget.user_id === user.id) return budget;

    const currentUser = await userRepository.findByIdWithUserGroup(user.id);
    if (currentUser && currentUser.user_group_id && budget.user_group_id) {
      if (currentUser.user_group_id === budget.user_group_id) {
        return budget;
      }
    }

    throw new Error('Budget not found');
  }

  async createBudget(user, budgetData) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    // Allow ROLE_ADMIN and ROLE_OWNER without restriction
    if (user.role === 'ROLE_ADMIN' || user.role === 'ROLE_OWNER') {
      let categoryId = null;
      if (budgetData.categoryId || (budgetData.category && budgetData.category.id)) {
        categoryId = budgetData.categoryId || budgetData.category.id;
        const cat = await categoryRepository.findById(categoryId);
        if (!cat) throw new Error('Category not found');
      }

      return await budgetRepository.create({
        ...budgetData,
        userId: user.id,
        categoryId,
      });
    }

    // For regular users: check if in group
    if (fullUser && fullUser.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const isGroupAdmin = fullUser.group_admin_id === admin.id;
        if (!isGroupAdmin) {
          throw new Error('Access denied: Group members cannot create budgets. Only group admins can create budgets.');
        }
      } else {
        throw new Error('Access denied: Group members cannot create budgets. Only group admins can create budgets.');
      }
    }

    let categoryId = null;
    if (budgetData.categoryId || (budgetData.category && budgetData.category.id)) {
      categoryId = budgetData.categoryId || budgetData.category.id;
      const cat = await categoryRepository.findById(categoryId);
      if (!cat) throw new Error('Category not found');
    }

    return await budgetRepository.create({
      ...budgetData,
      userId: user.id,
      categoryId,
    });
  }

  async updateBudget(user, id, budgetDetails) {
    const budget = await this.getBudget(user, id);

    const isOwner = budget.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && budget.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const budgetOwner = await userRepository.findByIdWithUserGroup(budget.user_id);
        isGroupAdmin = budgetOwner && budgetOwner.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to update this budget");
    }

    let categoryId = budgetDetails.categoryId || (budgetDetails.category && budgetDetails.category.id);
    if (categoryId) {
      const cat = await categoryRepository.findById(categoryId);
      if (!cat) throw new Error('Category not found');
    }

    return await budgetRepository.update(id, {
      ...budgetDetails,
      categoryId,
    });
  }

  async deleteBudget(user, id) {
    const budget = await this.getBudget(user, id);

    const isOwner = budget.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && budget.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const budgetOwner = await userRepository.findByIdWithUserGroup(budget.user_id);
        isGroupAdmin = budgetOwner && budgetOwner.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to delete this budget");
    }

    await budgetRepository.delete(id);
  }
}

module.exports = new BudgetService();

