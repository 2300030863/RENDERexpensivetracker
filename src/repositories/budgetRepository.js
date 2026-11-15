const { query, execute } = require('../config/database');

class BudgetRepository {
  _baseSelect() {
    return `
      SELECT b.*,
             c.id as category_id, c.name as category_name, c.color as category_color,
             u.id as user_owner_id, u.username as user_owner_username, u.user_group_id as user_group_id
      FROM budgets b
      LEFT JOIN categories c ON b.category_id = c.id
      JOIN users u ON b.user_id = u.id
    `;
  }

  async findById(id) {
    const sql = `${this._baseSelect()} WHERE b.id = ?`;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findByUserAndIsActiveTrueOrderByStartDateDesc(userId) {
    const sql = `${this._baseSelect()} WHERE b.user_id = ? AND b.is_active = 1 ORDER BY b.start_date DESC`;
    return await query(sql, [userId]);
  }

  async findByUserGroupAndIsActiveTrueOrderByStartDateDesc(groupId) {
    const sql = `
      ${this._baseSelect()} 
      WHERE u.user_group_id = ? AND b.is_active = 1 
      ORDER BY b.start_date DESC
    `;
    return await query(sql, [groupId]);
  }

  async findActiveBudgetsForDate(userId, date) {
    const sql = `
      ${this._baseSelect()}
      WHERE b.user_id = ? AND b.is_active = 1 AND ? BETWEEN b.start_date AND b.end_date
    `;
    return await query(sql, [userId, date]);
  }

  async findActiveBudgetsForGroupAndDate(groupId, date) {
    const sql = `
      ${this._baseSelect()}
      WHERE u.user_group_id = ? AND b.is_active = 1 AND ? BETWEEN b.start_date AND b.end_date
    `;
    return await query(sql, [groupId, date]);
  }

  async findActiveBudgetsForAdminAndDate(adminUserId, adminId, date) {
    const sql = `
      ${this._baseSelect()}
      LEFT JOIN admins adm ON u.admin_id = adm.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE (b.user_id = ? OR u.admin_id = ? OR ug.admin_id = ?)
      AND b.is_active = 1 AND ? BETWEEN b.start_date AND b.end_date
    `;
    return await query(sql, [adminUserId, adminId, adminId, date]);
  }

  async create(budget) {
    const sql = `
      INSERT INTO budgets (amount, start_date, end_date, type, alert_threshold, is_active, user_id, category_id, admin_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      parseFloat(budget.amount),
      budget.startDate || budget.start_date,
      budget.endDate || budget.end_date,
      budget.type || 'MONTHLY',
      budget.alertThreshold !== undefined ? parseInt(budget.alertThreshold, 10) : 80,
      budget.isActive !== undefined ? (budget.isActive ? 1 : 0) : 1,
      budget.userId || budget.user_id,
      budget.categoryId || budget.category_id || null,
      budget.adminId || budget.admin_id || null,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      amount: 'amount',
      startDate: 'start_date',
      start_date: 'start_date',
      endDate: 'end_date',
      end_date: 'end_date',
      type: 'type',
      alertThreshold: 'alert_threshold',
      alert_threshold: 'alert_threshold',
      isActive: 'is_active',
      is_active: 'is_active',
      categoryId: 'category_id',
      category_id: 'category_id',
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

    const sql = `UPDATE budgets SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('UPDATE budgets SET is_active = 0, updated_at = NOW() WHERE id = ?', [id]);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM budgets WHERE user_id = ?', [userId]);
  }
}

module.exports = new BudgetRepository();

