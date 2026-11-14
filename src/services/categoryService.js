const categoryRepository = require('../repositories/categoryRepository');
const adminRepository = require('../repositories/adminRepository');
const userRepository = require('../repositories/userRepository');

class CategoryService {
  async getAllCategories(user) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!fullUser) return [];

    const categories = [];

    // Always include default categories
    const defaultCategories = await categoryRepository.findAllDefaultCategories();
    categories.push(...defaultCategories);

    // User's own categories
    const ownCategories = await categoryRepository.findByUserId(fullUser.id);
    categories.push(...ownCategories);

    // Admin role: include categories from managed users
    if (fullUser.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(fullUser.username);
      if (admin) {
        const managedUserCats = await categoryRepository.findByAdminManagedUsers(admin.id);
        categories.push(...managedUserCats);
      }
    }

    // User in a group: include admin's categories and other members' categories
    if (fullUser.user_group_id) {
      if (fullUser.group_admin_username) {
        const adminUser = await userRepository.findByUsername(fullUser.group_admin_username);
        if (adminUser) {
          const adminCats = await categoryRepository.findByUserId(adminUser.id);
          categories.push(...adminCats);
        }
      }

      const groupCats = await categoryRepository.findByGroupMembers(fullUser.user_group_id);
      categories.push(...groupCats);
    }

    // Deduplicate by ID and sort by name
    const categoryMap = new Map();
    for (const cat of categories) {
      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, cat);
      }
    }

    return Array.from(categoryMap.values()).sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' })
    );
  }

  async getCategory(user, id) {
    const category = await categoryRepository.findById(id);
    if (!category) throw new Error('Category not found');

    // Allow default categories
    if (category.is_default || !category.user_id) return category;

    // Allow owner
    if (category.user_id === user.id) return category;

    // Allow admin managing the category's group
    const catOwner = await userRepository.findByIdWithUserGroup(category.user_id);
    if (user.role === 'ROLE_ADMIN' && catOwner && catOwner.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin && catOwner.group_admin_id === admin.id) {
        return category;
      }
    }

    // Allow group members
    const currentUserFull = await userRepository.findByIdWithUserGroup(user.id);
    if (currentUserFull && currentUserFull.user_group_id && catOwner && catOwner.user_group_id) {
      if (currentUserFull.user_group_id === catOwner.user_group_id) {
        return category;
      }
    }

    throw new Error('Category not found');
  }

  async createCategory(user, categoryData) {
    const exists = await categoryRepository.existsByNameAndUser(categoryData.name, user.id);
    if (exists) {
      throw new Error('Category with this name already exists');
    }

    return await categoryRepository.create({
      name: categoryData.name,
      description: categoryData.description || '',
      color: categoryData.color || '#4CAF50',
      isDefault: false,
      isOccupationGenerated: false,
      userId: user.id,
    });
  }

  async updateCategory(user, id, categoryDetails) {
    const category = await this.getCategory(user, id);

    if (category.is_default) {
      throw new Error('Cannot modify default categories');
    }

    const isOwner = category.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && category.user_id) {
      const catOwner = await userRepository.findByIdWithUserGroup(category.user_id);
      const admin = await adminRepository.findByUsername(user.username);
      if (admin && catOwner) {
        isGroupAdmin = catOwner.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to update this category");
    }

    if (categoryDetails.name && categoryDetails.name !== category.name) {
      const exists = await categoryRepository.existsByNameAndUser(categoryDetails.name, user.id);
      if (exists) {
        throw new Error('Category with this name already exists');
      }
    }

    return await categoryRepository.update(id, categoryDetails);
  }

  async deleteCategory(user, id) {
    const category = await this.getCategory(user, id);

    if (category.is_default) {
      throw new Error('Cannot delete default categories');
    }

    const isOwner = category.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN' && category.user_id) {
      const catOwner = await userRepository.findByIdWithUserGroup(category.user_id);
      const admin = await adminRepository.findByUsername(user.username);
      if (admin && catOwner) {
        isGroupAdmin = catOwner.group_admin_id === admin.id;
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to delete this category");
    }

    await categoryRepository.delete(id);
  }
}

module.exports = new CategoryService();

