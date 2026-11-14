const accountRepository = require('../repositories/accountRepository');
const adminRepository = require('../repositories/adminRepository');
const userRepository = require('../repositories/userRepository');
const userGroupRepository = require('../repositories/userGroupRepository');

class AccountService {
  async getAllAccounts(user) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);
    if (!fullUser) return [];

    // Admin role
    if (fullUser.role === 'ROLE_ADMIN') {
      let admin = await adminRepository.findByUsername(fullUser.username);
      if (!admin) {
        admin = await adminRepository.findByEmail(fullUser.email);
      }

      if (admin) {
        // Admin's own accounts
        const adminAccounts = await accountRepository.findByUserAndIsActiveTrueOrderByName(fullUser.id);

        // Accounts from directly managed users
        const directUsers = await userRepository.findByAdmin(admin.id);
        const directUserAccounts = [];
        for (const u of directUsers) {
          const accs = await accountRepository.findByUserAndIsActiveTrueOrderByName(u.id);
          directUserAccounts.push(...accs);
        }

        // Accounts from users in groups managed by this admin
        const groups = await userGroupRepository.findByAdmin(admin.id);
        const groupUserAccounts = [];
        for (const g of groups) {
          const usersInGroup = await userRepository.findByUserGroupId(g.id);
          for (const u of usersInGroup) {
            const accs = await accountRepository.findByUserAndIsActiveTrueOrderByName(u.id);
            groupUserAccounts.push(...accs);
          }
        }

        // Combine and deduplicate
        const accountMap = new Map();
        [...adminAccounts, ...directUserAccounts, ...groupUserAccounts].forEach(acc => {
          accountMap.set(acc.id, acc);
        });

        return Array.from(accountMap.values());
      }
    }

    // User in a group
    if (fullUser.user_group_id) {
      return await accountRepository.findByUserGroupIncludingAdminAndIsActiveTrueOrderByName(fullUser.user_group_id);
    }

    // Default: user's own accounts
    return await accountRepository.findByUserAndIsActiveTrueOrderByName(fullUser.id);
  }

  async getAccount(user, id) {
    const account = await accountRepository.findById(id);
    if (!account) throw new Error('Account not found');

    // Check ownership
    if (account.user_id === user.id) return account;

    // Check admin rights
    if (user.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const accountOwner = await userRepository.findByIdWithUserGroup(account.user_id);
        if (accountOwner && (
          accountOwner.admin_id === admin.id ||
          accountOwner.group_admin_id === admin.id
        )) {
          return account;
        }
      }
    }

    // Check if in same group
    const currentUserFull = await userRepository.findByIdWithUserGroup(user.id);
    const accountOwner = await userRepository.findByIdWithUserGroup(account.user_id);
    if (currentUserFull && currentUserFull.user_group_id && accountOwner && accountOwner.user_group_id) {
      if (currentUserFull.user_group_id === accountOwner.user_group_id) {
        return account;
      }
    }

    throw new Error('Account not found');
  }

  async createAccount(user, accountData) {
    const fullUser = await userRepository.findByIdWithUserGroup(user.id);

    // Allow ROLE_ADMIN and ROLE_OWNER without group restriction
    if (user.role === 'ROLE_ADMIN' || user.role === 'ROLE_OWNER') {
      return await accountRepository.create({
        ...accountData,
        userId: user.id,
      });
    }

    // For regular users in a group: only group admins can create accounts
    if (fullUser && fullUser.user_group_id) {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const isGroupAdmin = fullUser.group_admin_id === admin.id;
        if (!isGroupAdmin) {
          throw new Error('Access denied: Group members cannot create accounts. Only group admins can create accounts.');
        }
      } else {
        throw new Error('Access denied: Group members cannot create accounts. Only group admins can create accounts.');
      }
    }

    return await accountRepository.create({
      ...accountData,
      userId: user.id,
    });
  }

  async updateAccount(user, id, accountDetails) {
    const account = await this.getAccount(user, id);

    const isOwner = account.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const accountOwner = await userRepository.findByIdWithUserGroup(account.user_id);
        isGroupAdmin = accountOwner && (
          accountOwner.admin_id === admin.id ||
          accountOwner.group_admin_id === admin.id
        );
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to update this account");
    }

    return await accountRepository.update(id, accountDetails);
  }

  async deleteAccount(user, id) {
    const account = await this.getAccount(user, id);

    const isOwner = account.user_id === user.id;
    const isOwnerRole = user.role === 'ROLE_OWNER';
    let isGroupAdmin = false;

    if (user.role === 'ROLE_ADMIN') {
      const admin = await adminRepository.findByUsername(user.username);
      if (admin) {
        const accountOwner = await userRepository.findByIdWithUserGroup(account.user_id);
        isGroupAdmin = accountOwner && (
          accountOwner.admin_id === admin.id ||
          accountOwner.group_admin_id === admin.id
        );
      }
    }

    if (!isOwner && !isGroupAdmin && !isOwnerRole) {
      throw new Error("Access denied: You don't have permission to delete this account");
    }

    await accountRepository.update(id, { isActive: false });
  }
}

module.exports = new AccountService();

