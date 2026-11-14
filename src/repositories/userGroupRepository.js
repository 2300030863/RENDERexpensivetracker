const { query, execute } = require('../config/database');

class UserGroupRepository {
  async findById(id) {
    const rows = await query('SELECT * FROM user_groups WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByAdmin(adminId) {
    return await query('SELECT * FROM user_groups WHERE admin_id = ? ORDER BY id ASC', [adminId]);
  }

  async findAll() {
    return await query('SELECT * FROM user_groups ORDER BY id ASC');
  }

  async create(group) {
    const sql = `
      INSERT INTO user_groups (name, description, admin_id)
      VALUES (?, ?, ?)
    `;
    const params = [
      group.name,
      group.description || '',
      group.adminId || group.admin_id,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async delete(id) {
    await execute('DELETE FROM user_groups WHERE id = ?', [id]);
  }
}

module.exports = new UserGroupRepository();

