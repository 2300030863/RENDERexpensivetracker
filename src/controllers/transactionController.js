const transactionService = require('../services/transactionService');

function convertToDto(t, currentUser) {
  const isOwner = t.user_id === currentUser.id;
  const isAdmin = currentUser.role === 'ROLE_ADMIN';
  const isOwnerRole = currentUser.role === 'ROLE_OWNER';

  let isGroupAdmin = false;
  if (isAdmin && t.group_admin_username) {
    isGroupAdmin = t.group_admin_username === currentUser.username;
  }

  const canEdit = isOwner || isGroupAdmin || isOwnerRole;
  const canDelete = isOwner || isGroupAdmin || isOwnerRole;

  let formattedDate = t.transaction_date;
  if (formattedDate instanceof Date) {
    formattedDate = formattedDate.toISOString().split('T')[0];
  }

  return {
    id: t.id,
    amount: parseFloat(t.amount),
    description: t.description,
    type: t.type,
    transactionDate: formattedDate,
    notes: t.notes || '',
    categoryId: t.category_id,
    categoryName: t.category_name,
    categoryColor: t.category_color,
    accountId: t.account_id,
    accountName: t.account_name,
    accountType: t.account_type || null,
    createdAt: t.created_at,
    userId: t.user_id || null,
    username: t.username || null,
    userEmail: t.user_email || null,
    canDelete,
    canEdit,
  };
}

class TransactionController {
  async getAllTransactions(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 0;
      const size = parseInt(req.query.size, 10) || 10;

      const pageResult = await transactionService.getAllTransactions(req.user, page, size);
      const mappedContent = pageResult.content.map(t => convertToDto(t, req.user));

      return res.status(200).json({
        ...pageResult,
        content: mappedContent,
      });
    } catch (error) {
      console.error('Get transactions error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async searchTransactions(req, res) {
    try {
      const { startDate, endDate, categoryId, accountId } = req.query;
      const list = await transactionService.searchTransactions(req.user, startDate, endDate, categoryId, accountId);
      const mapped = list.map(t => convertToDto(t, req.user));
      return res.status(200).json(mapped);
    } catch (error) {
      console.error('Search transactions error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  async getTransaction(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const t = await transactionService.getTransaction(req.user, id);
      return res.status(200).json(convertToDto(t, req.user));
    } catch (error) {
      console.error('Get transaction error:', error);
      return res.status(404).json({ error: error.message });
    }
  }

  async createTransaction(req, res) {
    try {
      const t = await transactionService.createTransaction(req.user, req.body);
      return res.status(200).json(convertToDto(t, req.user));
    } catch (error) {
      console.error('Create transaction error:', error);
      return res.status(400).send(error.message);
    }
  }

  async updateTransaction(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      const t = await transactionService.updateTransaction(req.user, id, req.body);
      return res.status(200).json(convertToDto(t, req.user));
    } catch (error) {
      console.error('Update transaction error:', error);
      return res.status(400).send(error.message);
    }
  }

  async deleteTransaction(req, res) {
    try {
      const id = parseInt(req.params.id, 10);
      await transactionService.deleteTransaction(req.user, id);
      return res.status(200).send();
    } catch (error) {
      console.error('Delete transaction error:', error);
      return res.status(400).send(error.message);
    }
  }
}

module.exports = new TransactionController();

