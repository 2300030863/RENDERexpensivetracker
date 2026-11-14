const { query, execute } = require('../config/database');

class RecurringTransactionRepository {
  _baseSelect() {
    return `
      SELECT rt.*,
             c.id as category_id, c.name as category_name, c.color as category_color,
             a.id as account_id, a.name as account_name, a.type as account_type,
             u.id as user_owner_id, u.username as user_owner_username, u.user_group_id as user_group_id,
             ug.admin_id as group_admin_id,
             adm.username as group_admin_username
      FROM recurring_transactions rt
      JOIN categories c ON rt.category_id = c.id
      JOIN accounts a ON rt.account_id = a.id
      JOIN users u ON rt.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      LEFT JOIN admins adm ON ug.admin_id = adm.id
    `;
  }

  async findById(id) {
    const sql = `${this._baseSelect()} WHERE rt.id = ?`;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findByUserOrderByNextDueDateAsc(userId) {
    const sql = `${this._baseSelect()} WHERE rt.user_id = ? ORDER BY rt.next_due_date ASC`;
    return await query(sql, [userId]);
  }

  async findByUserAndIsActiveTrueOrderByNextDueDateAsc(userId) {
    const sql = `${this._baseSelect()} WHERE rt.user_id = ? AND rt.is_active = 1 ORDER BY rt.next_due_date ASC`;
    return await query(sql, [userId]);
  }

  async findByUserGroupOrderByNextDueDateAsc(groupId) {
    const sql = `
      ${this._baseSelect()}
      WHERE u.user_group_id = ?
      ORDER BY rt.next_due_date ASC
    `;
    return await query(sql, [groupId]);
  }

  async findByUserGroupAndIsActiveTrueOrderByNextDueDateAsc(groupId) {
    const sql = `
      ${this._baseSelect()}
      WHERE u.user_group_id = ? AND rt.is_active = 1
      ORDER BY rt.next_due_date ASC
    `;
    return await query(sql, [groupId]);
  }

  async findDueRecurringTransactions(userId, date) {
    const sql = `
      ${this._baseSelect()}
      WHERE rt.user_id = ? AND rt.is_active = 1 
      AND rt.next_due_date <= ? 
      AND (rt.end_date IS NULL OR rt.end_date >= ?)
    `;
    return await query(sql, [userId, date, date]);
  }

  async findAllDue(date) {
    const sql = `
      ${this._baseSelect()}
      WHERE rt.is_active = 1 
      AND rt.next_due_date <= ? 
      AND (rt.end_date IS NULL OR rt.end_date >= ?)
    `;
    return await query(sql, [date, date]);
  }

  async create(rt) {
    const sql = `
      INSERT INTO recurring_transactions (
        description, amount, type, recurrence_type, start_date, end_date, next_due_date, notes, is_active, user_id, category_id, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      rt.description,
      parseFloat(rt.amount),
      rt.type,
      rt.recurrenceType || rt.recurrence_type,
      rt.startDate || rt.start_date,
      rt.endDate || rt.end_date || null,
      rt.nextDueDate || rt.next_due_date,
      rt.notes || '',
      rt.isActive !== undefined ? (rt.isActive ? 1 : 0) : 1,
      rt.userId || rt.user_id,
      rt.categoryId || rt.category_id,
      rt.accountId || rt.account_id,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      description: 'description',
      amount: 'amount',
      type: 'type',
      recurrenceType: 'recurrence_type',
      recurrence_type: 'recurrence_type',
      startDate: 'start_date',
      start_date: 'start_date',
      endDate: 'end_date',
      end_date: 'end_date',
      nextDueDate: 'next_due_date',
      next_due_date: 'next_due_date',
      notes: 'notes',
      isActive: 'is_active',
      is_active: 'is_active',
      categoryId: 'category_id',
      category_id: 'category_id',
      accountId: 'account_id',
      account_id: 'account_id',
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

    const sql = `UPDATE recurring_transactions SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('DELETE FROM recurring_transactions WHERE id = ?', [id]);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM recurring_transactions WHERE user_id = ?', [userId]);
  }
}

module.exports = new RecurringTransactionRepository();

