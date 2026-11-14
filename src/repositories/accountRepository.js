const { query, execute } = require('../config/database');

class AccountRepository {
  async findById(id) {
    const rows = await query('SELECT * FROM accounts WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByUserId(userId) {
    return await query('SELECT * FROM accounts WHERE user_id = ? ORDER BY name ASC', [userId]);
  }

  async findByUserAndIsActiveTrueOrderByName(userId) {
    return await query('SELECT * FROM accounts WHERE user_id = ? AND is_active = 1 ORDER BY name ASC', [userId]);
  }

  async findByUserGroupAndIsActiveTrueOrderByName(groupId) {
    const sql = `
      SELECT a.* FROM accounts a
      JOIN users u ON a.user_id = u.id
      WHERE u.user_group_id = ? AND a.is_active = 1
      ORDER BY a.name ASC
    `;
    return await query(sql, [groupId]);
  }

  async findByUserGroupIncludingAdminAndIsActiveTrueOrderByName(groupId) {
    const sql = `
      SELECT DISTINCT a.* FROM accounts a
      JOIN users u ON a.user_id = u.id
      WHERE (
        u.user_group_id = ? OR 
        (u.role = 'ROLE_ADMIN' AND EXISTS (
          SELECT 1 FROM user_groups ug 
          JOIN admins adm ON ug.admin_id = adm.id
          WHERE ug.id = ? AND adm.username = u.username
        ))
      )
      AND a.is_active = 1
      ORDER BY a.name ASC
    `;
    return await query(sql, [groupId, groupId]);
  }

  async findByAdminManagedUsersAndIsActiveTrueOrderByName(adminUsername) {
    const sql = `
      SELECT DISTINCT a.* FROM accounts a
      JOIN users u ON a.user_id = u.id
      LEFT JOIN admins adm ON u.admin_id = adm.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      LEFT JOIN admins ug_adm ON ug.admin_id = ug_adm.id
      WHERE (
        u.username = ? OR 
        adm.username = ? OR 
        ug_adm.username = ?
      )
      AND a.is_active = 1
      ORDER BY a.name ASC
    `;
    return await query(sql, [adminUsername, adminUsername, adminUsername]);
  }

  async create(account) {
    const sql = `
      INSERT INTO accounts (name, description, type, balance, is_active, user_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const params = [
      account.name,
      account.description || '',
      account.type || 'OTHER',
      account.balance !== undefined ? parseFloat(account.balance) : 0.00,
      account.isActive !== undefined ? (account.isActive ? 1 : 0) : 1,
      account.userId || account.user_id,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      name: 'name',
      description: 'description',
      type: 'type',
      balance: 'balance',
      isActive: 'is_active',
      is_active: 'is_active',
    };

    for (const [key, val] of Object.entries(fields)) {
      if (fieldMap[key] !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        if (typeof val === 'boolean') {
          params.push(val ? 1 : 0);
        } else {
          params.push(val);
        }
      }
    }

    if (updates.length === 0) return await this.findById(id);

    updates.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE accounts SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async updateBalance(id, amount, type) {
    const numericAmount = parseFloat(amount);
    let sql;
    if (type === 'INCOME') {
      sql = 'UPDATE accounts SET balance = balance + ?, updated_at = NOW() WHERE id = ?';
    } else {
      sql = 'UPDATE accounts SET balance = balance - ?, updated_at = NOW() WHERE id = ?';
    }
    await execute(sql, [numericAmount, id]);
    return await this.findById(id);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM accounts WHERE user_id = ?', [userId]);
  }
}

module.exports = new AccountRepository();

