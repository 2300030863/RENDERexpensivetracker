const { query, execute } = require('../config/database');

class CategoryRepository {
  async findById(id) {
    const rows = await query(`
      SELECT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [id]);
    return rows[0] || null;
  }

  async findAllDefaultCategories() {
    return await query('SELECT * FROM categories WHERE is_default = 1 OR user_id IS NULL ORDER BY name ASC');
  }

  async findByUserId(userId) {
    return await query(`
      SELECT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.user_id = ? 
      ORDER BY c.name ASC
    `, [userId]);
  }

  async findByUserOrIsDefaultTrueOrderByName(userId) {
    return await query(`
      SELECT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.user_id = ? OR c.is_default = 1 OR c.user_id IS NULL 
      ORDER BY c.name ASC
    `, [userId]);
  }

  async existsByNameAndUser(name, userId) {
    const rows = await query('SELECT id FROM categories WHERE name = ? AND user_id = ? LIMIT 1', [name, userId]);
    return rows.length > 0;
  }

  async findByAdmin(adminId) {
    return await query('SELECT * FROM categories WHERE admin_id = ? ORDER BY name ASC', [adminId]);
  }

  async findByUserGroupOrIsDefaultTrue(groupId) {
    const sql = `
      SELECT DISTINCT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE (u.user_group_id = ?) OR c.is_default = 1 OR c.user_id IS NULL
      ORDER BY c.name ASC
    `;
    return await query(sql, [groupId]);
  }

  async findByUserIdAndIsOccupationGenerated(userId, isOccupationGenerated = true) {
    return await query(
      'SELECT * FROM categories WHERE user_id = ? AND is_occupation_generated = ? ORDER BY name ASC',
      [userId, isOccupationGenerated ? 1 : 0]
    );
  }

  async findByAdminManagedUsers(adminId) {
    const sql = `
      SELECT DISTINCT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      JOIN users u ON c.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE u.admin_id = ? OR ug.admin_id = ?
      ORDER BY c.name ASC
    `;
    return await query(sql, [adminId, adminId]);
  }

  async findByGroupMembers(groupId) {
    const sql = `
      SELECT DISTINCT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      JOIN users u ON c.user_id = u.id
      WHERE u.user_group_id = ?
      ORDER BY c.name ASC
    `;
    return await query(sql, [groupId]);
  }

  async findAll() {
    return await query(`
      SELECT c.*, u.id as user_owner_id, u.username as user_owner_username
      FROM categories c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.name ASC
    `);
  }

  async create(cat) {
    const sql = `
      INSERT INTO categories (name, description, color, is_default, is_occupation_generated, user_id, admin_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      cat.name,
      cat.description || '',
      cat.color || '#4CAF50',
      cat.isDefault || cat.is_default ? 1 : 0,
      cat.isOccupationGenerated || cat.is_occupation_generated ? 1 : 0,
      cat.userId || cat.user_id || null,
      cat.adminId || cat.admin_id || null,
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
      color: 'color',
      isDefault: 'is_default',
      is_default: 'is_default',
      isOccupationGenerated: 'is_occupation_generated',
      is_occupation_generated: 'is_occupation_generated',
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

    const sql = `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('DELETE FROM categories WHERE id = ?', [id]);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM categories WHERE user_id = ?', [userId]);
  }

  async deleteAll(categoryIds) {
    if (!categoryIds || categoryIds.length === 0) return;
    const placeholders = categoryIds.map(() => '?').join(',');
    await execute(`DELETE FROM categories WHERE id IN (${placeholders})`, categoryIds);
  }
}

module.exports = new CategoryRepository();

