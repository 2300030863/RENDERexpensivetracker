const accountService = require('../services/accountService');

const formatAccountDto = (a) => ({
  id: a.id,
  name: a.name,
  description: a.description,
  type: a.type,
  balance: a.balance != null ? parseFloat(a.balance) : 0,
  isActive: a.is_active !== undefined ? !!a.is_active : (a.isActive !== undefined ? !!a.isActive : true),
});

class AccountController {
  async getAllAccounts(req, res, next) {
    try {
      const accounts = await accountService.getAllAccounts(req.user);
      res.json(accounts.map(formatAccountDto));
    } catch (err) {
      next(err);
    }
  }

  async getAccount(req, res, next) {
    try {
      const account = await accountService.getAccount(req.user, req.params.id);
      res.json(formatAccountDto(account));
    } catch (err) {
      next(err);
    }
  }

  async createAccount(req, res, next) {
    try {
      const account = await accountService.createAccount(req.user, req.body);
      res.status(201).json(formatAccountDto(account));
    } catch (err) {
      next(err);
    }
  }

  async updateAccount(req, res, next) {
    try {
      const account = await accountService.updateAccount(req.user, req.params.id, req.body);
      res.json(formatAccountDto(account));
    } catch (err) {
      next(err);
    }
  }

  async deleteAccount(req, res, next) {
    try {
      await accountService.deleteAccount(req.user, req.params.id);
      res.status(200).send();
    } catch (err) {
      next(err);
    }
  }
}

module.exports = new AccountController();

