const { query, execute } = require('../config/database');

class TransactionRepository {
  _baseSelect() {
    return `
      SELECT t.*,
             c.name as category_name, c.color as category_color, c.description as category_description,
             a.name as account_name, a.type as account_type, a.balance as account_balance,
             u.id as user_id, u.username as username, u.email as user_email, u.role as user_role,
             u.user_group_id as user_group_id, u.admin_id as user_admin_id,
             ug.admin_id as group_admin_id,
             adm.username as group_admin_username
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      JOIN accounts a ON t.account_id = a.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      LEFT JOIN admins adm ON ug.admin_id = adm.id
    `;
  }

  async findById(id) {
    const sql = `${this._baseSelect()} WHERE t.id = ?`;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findByUserId(userId) {
    const sql = `${this._baseSelect()} WHERE t.user_id = ? ORDER BY t.transaction_date DESC`;
    return await query(sql, [userId]);
  }

  async findByUser(userId) {
    const sql = `${this._baseSelect()} WHERE t.user_id = ? ORDER BY t.transaction_date DESC`;
    return await query(sql, [userId]);
  }

  async findAll() {
    const sql = `${this._baseSelect()} ORDER BY t.transaction_date DESC`;
    return await query(sql);
  }

  // Paginated user transactions
  async findByUserPaginated(userId, limit, offset) {
    const countSql = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
    const [countRow] = await query(countSql, [userId]);
    const total = countRow ? countRow.total : 0;

    const sql = `${this._baseSelect()} WHERE t.user_id = ? ORDER BY t.transaction_date DESC LIMIT ? OFFSET ?`;
    const content = await query(sql, [userId, limit, offset]);

    return { content, total };
  }

  // Paginated group transactions (only group members, excluding admin)
  async findByUserGroupPaginated(groupId, limit, offset) {
    const countSql = `
      SELECT COUNT(*) as total 
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER'
    `;
    const [countRow] = await query(countSql, [groupId]);
    const total = countRow ? countRow.total : 0;

    const sql = `
      ${this._baseSelect()} 
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER'
      ORDER BY t.transaction_date DESC 
      LIMIT ? OFFSET ?
    `;
    const content = await query(sql, [groupId, limit, offset]);

    return { content, total };
  }

  // Paginated admin managed users + admin's own transactions
  async findByAdminManagedUsersPaginated(adminUserId, adminId, limit, offset) {
    const countSql = `
      SELECT COUNT(DISTINCT t.id) as total 
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE t.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?
    `;
    const [countRow] = await query(countSql, [adminUserId, adminId, adminId]);
    const total = countRow ? countRow.total : 0;

    const sql = `
      ${this._baseSelect()} 
      WHERE t.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?
      ORDER BY t.transaction_date DESC 
      LIMIT ? OFFSET ?
    `;
    const content = await query(sql, [adminUserId, adminId, adminId, limit, offset]);

    return { content, total };
  }

  // Paginated all transactions (Owner)
  async findAllPaginated(limit, offset) {
    const countSql = 'SELECT COUNT(*) as total FROM transactions';
    const [countRow] = await query(countSql);
    const total = countRow ? countRow.total : 0;

    const sql = `${this._baseSelect()} ORDER BY t.transaction_date DESC LIMIT ? OFFSET ?`;
    const content = await query(sql, [limit, offset]);

    return { content, total };
  }

  // Search transactions for regular user
  async searchByUser(userId, startDate, endDate, categoryId, accountId) {
    let sql = `${this._baseSelect()} WHERE t.user_id = ? AND t.transaction_date BETWEEN ? AND ?`;
    const params = [userId, startDate, endDate];

    if (categoryId) {
      sql += ' AND t.category_id = ?';
      params.push(categoryId);
    }
    if (accountId) {
      sql += ' AND t.account_id = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY t.transaction_date DESC';
    return await query(sql, params);
  }

  // Search transactions for user group
  async searchByUserGroup(groupId, startDate, endDate, categoryId, accountId) {
    let sql = `
      ${this._baseSelect()} 
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER' 
      AND t.transaction_date BETWEEN ? AND ?
    `;
    const params = [groupId, startDate, endDate];

    if (categoryId) {
      sql += ' AND t.category_id = ?';
      params.push(categoryId);
    }
    if (accountId) {
      sql += ' AND t.account_id = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY t.transaction_date DESC';
    return await query(sql, params);
  }

  // Search transactions for admin
  async searchByAdminManagedUsers(adminUserId, adminId, startDate, endDate, categoryId, accountId) {
    let sql = `
      ${this._baseSelect()} 
      WHERE (t.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?)
      AND t.transaction_date BETWEEN ? AND ?
    `;
    const params = [adminUserId, adminId, adminId, startDate, endDate];

    if (categoryId) {
      sql += ' AND t.category_id = ?';
      params.push(categoryId);
    }
    if (accountId) {
      sql += ' AND t.account_id = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY t.transaction_date DESC';
    return await query(sql, params);
  }

  // Search for owner (all)
  async searchAll(startDate, endDate, categoryId, accountId) {
    let sql = `${this._baseSelect()} WHERE t.transaction_date BETWEEN ? AND ?`;
    const params = [startDate, endDate];

    if (categoryId) {
      sql += ' AND t.category_id = ?';
      params.push(categoryId);
    }
    if (accountId) {
      sql += ' AND t.account_id = ?';
      params.push(accountId);
    }

    sql += ' ORDER BY t.transaction_date DESC';
    return await query(sql, params);
  }

  // Analytics queries
  async sumAmountByUserAndTypeAndDateRange(userId, type, startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE user_id = ? AND type = ? AND transaction_date BETWEEN ? AND ?
    `;
    const [row] = await query(sql, [userId, type, startDate, endDate]);
    return row ? parseFloat(row.total) : 0;
  }

  async sumAmountByUserAndTypeAndCategoryAndDateRange(userId, type, categoryId, startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE user_id = ? AND type = ? AND category_id = ? AND transaction_date BETWEEN ? AND ?
    `;
    const [row] = await query(sql, [userId, type, categoryId, startDate, endDate]);
    return row ? parseFloat(row.total) : 0;
  }

  async getCategoryWiseSpending(userId, type = 'EXPENSE', startDate, endDate) {
    const sql = `
      SELECT c.name as category_name, COALESCE(SUM(t.amount), 0) as total_amount
      FROM transactions t
      JOIN categories c ON t.category_id = c.id
      WHERE t.user_id = ? AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.name
      ORDER BY total_amount DESC
    `;
    const rows = await query(sql, [userId, type, startDate, endDate]);
    return rows.map(r => [r.category_name, parseFloat(r.total_amount)]);
  }

  async getMonthlyTrend(userId, type = 'EXPENSE', startDate, endDate) {
    const sql = `
      SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') as month_str, COALESCE(SUM(t.amount), 0) as total_amount
      FROM transactions t
      WHERE t.user_id = ? AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m')
      ORDER BY month_str ASC
    `;
    const rows = await query(sql, [userId, type, startDate, endDate]);
    return rows.map(r => [r.month_str, parseFloat(r.total_amount)]);
  }

  // User Group Analytics
  async sumAmountByUserGroupAndTypeAndDateRange(groupId, type, startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(t.amount), 0) as total
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER' AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
    `;
    const [row] = await query(sql, [groupId, type, startDate, endDate]);
    return row ? parseFloat(row.total) : 0;
  }

  async sumAmountByUserGroupAndTypeAndCategoryAndDateRange(groupId, type, categoryId, startDate, endDate) {
    const sql = `
      SELECT COALESCE(SUM(t.amount), 0) as total
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER' AND t.type = ? AND t.category_id = ? AND t.transaction_date BETWEEN ? AND ?
    `;
    const [row] = await query(sql, [groupId, type, categoryId, startDate, endDate]);
    return row ? parseFloat(row.total) : 0;
  }

  async getCategoryWiseSpendingByUserGroup(groupId, type = 'EXPENSE', startDate, endDate) {
    const sql = `
      SELECT c.name as category_name, COALESCE(SUM(t.amount), 0) as total_amount
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      JOIN categories c ON t.category_id = c.id
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER' AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
      GROUP BY c.name
      ORDER BY total_amount DESC
    `;
    const rows = await query(sql, [groupId, type, startDate, endDate]);
    return rows.map(r => [r.category_name, parseFloat(r.total_amount)]);
  }

  async getMonthlyTrendByUserGroup(groupId, type = 'EXPENSE', startDate, endDate) {
    const sql = `
      SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') as month_str, COALESCE(SUM(t.amount), 0) as total_amount
      FROM transactions t
      JOIN users u ON t.user_id = u.id
      WHERE u.user_group_id = ? AND u.role = 'ROLE_USER' AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m')
      ORDER BY month_str ASC
    `;
    const rows = await query(sql, [groupId, type, startDate, endDate]);
    return rows.map(r => [r.month_str, parseFloat(r.total_amount)]);
  }

  // Admin Analytics
  async findByAdminManagedUsersAndDateRange(adminUserId, adminId, startDate, endDate) {
    const sql = `
      ${this._baseSelect()}
      WHERE (t.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?)
      AND t.transaction_date BETWEEN ? AND ?
      ORDER BY t.transaction_date DESC
    `;
    return await query(sql, [adminUserId, adminId, adminId, startDate, endDate]);
  }

  async getMonthlyTrendByAdminManagedUsers(adminUserId, adminId, type = 'EXPENSE', startDate, endDate) {
    const sql = `
      SELECT DATE_FORMAT(t.transaction_date, '%Y-%m') as month_str, COALESCE(SUM(t.amount), 0) as total_amount
      FROM transactions t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE (t.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?)
      AND t.type = ? AND t.transaction_date BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(t.transaction_date, '%Y-%m')
      ORDER BY month_str ASC
    `;
    const rows = await query(sql, [adminUserId, adminId, adminId, type, startDate, endDate]);
    return rows.map(r => [r.month_str, parseFloat(r.total_amount)]);
  }

  async create(txn) {
    const sql = `
      INSERT INTO transactions (
        amount, description, type, transaction_date, notes, 
        user_id, category_id, account_id, recurring_transaction_id, admin_id, is_approved
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      parseFloat(txn.amount),
      txn.description,
      txn.type,
      txn.transactionDate || txn.transaction_date,
      txn.notes || '',
      txn.userId || txn.user_id || null,
      txn.categoryId || txn.category_id,
      txn.accountId || txn.account_id,
      txn.recurringTransactionId || txn.recurring_transaction_id || null,
      txn.adminId || txn.admin_id || null,
      txn.isApproved || txn.is_approved ? 1 : 0,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      amount: 'amount',
      description: 'description',
      type: 'type',
      transactionDate: 'transaction_date',
      transaction_date: 'transaction_date',
      notes: 'notes',
      categoryId: 'category_id',
      category_id: 'category_id',
      accountId: 'account_id',
      account_id: 'account_id',
      recurringTransactionId: 'recurring_transaction_id',
      recurring_transaction_id: 'recurring_transaction_id',
      isApproved: 'is_approved',
      is_approved: 'is_approved',
      userId: 'user_id',
      user_id: 'user_id',
    };

    for (const [key, val] of Object.entries(fields)) {
      if (fieldMap[key] !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        if (typeof val === 'boolean') {
          params.push(val ? 1 : 0);
        } else if (key === 'amount') {
          params.push(parseFloat(val));
        } else {
          params.push(val);
        }
      }
    }

    if (updates.length === 0) return await this.findById(id);

    updates.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE transactions SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async approve(id) {
    await execute('UPDATE transactions SET is_approved = 1, updated_at = NOW() WHERE id = ?', [id]);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('DELETE FROM transactions WHERE id = ?', [id]);
  }

  async nullifyUser(userId) {
    await execute('UPDATE transactions SET user_id = NULL WHERE user_id = ?', [userId]);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM transactions WHERE user_id = ?', [userId]);
  }
}

module.exports = new TransactionRepository();

