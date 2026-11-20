const { query, execute } = require('../config/database');

function normalizeGroup(group) {
  if (!group) return null;
  return {
    ...group,
    adminId: group.admin_id !== undefined ? group.admin_id : group.adminId,
    createdAt: group.created_at || group.createdAt,
    updatedAt: group.updated_at || group.updatedAt,
  };
}

class UserGroupRepository {
  async findById(id) {
    const rows = await query('SELECT * FROM user_groups WHERE id = ?', [id]);
    return normalizeGroup(rows[0]) || null;
  }

  async findByAdmin(adminId) {
    const rows = await query('SELECT * FROM user_groups WHERE admin_id = ? ORDER BY id ASC', [adminId]);
    return rows.map(normalizeGroup);
  }

  async findAll() {
    const rows = await query('SELECT * FROM user_groups ORDER BY id ASC');
    return rows.map(normalizeGroup);
  }

  async create(group) {
    const sql = `
      INSERT INTO user_groups (name, description, admin_id, created_at)
      VALUES (?, ?, ?, NOW())
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

