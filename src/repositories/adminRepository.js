const { query, execute } = require('../config/database');

class AdminRepository {
  async findById(id) {
    const rows = await query('SELECT * FROM admins WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByUsername(username) {
    const rows = await query('SELECT * FROM admins WHERE username = ?', [username]);
    return rows[0] || null;
  }

  async findByEmail(email) {
    const rows = await query('SELECT * FROM admins WHERE email = ?', [email]);
    return rows[0] || null;
  }

  async findByOwner(ownerId) {
    return await query('SELECT * FROM admins WHERE owner_id = ? ORDER BY id ASC', [ownerId]);
  }

  async findByIsActive(isActive) {
    return await query('SELECT * FROM admins WHERE is_active = ? ORDER BY id ASC', [isActive ? 1 : 0]);
  }

  async existsByUsername(username) {
    const rows = await query('SELECT id FROM admins WHERE username = ? LIMIT 1', [username]);
    return rows.length > 0;
  }

  async existsByEmail(email) {
    const rows = await query('SELECT id FROM admins WHERE email = ? LIMIT 1', [email]);
    return rows.length > 0;
  }

  async create(admin) {
    const sql = `
      INSERT INTO admins (username, email, password, first_name, last_name, is_active, owner_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      admin.username,
      admin.email,
      admin.password,
      admin.firstName || admin.first_name || '',
      admin.lastName || admin.last_name || '',
      admin.isActive !== undefined ? (admin.isActive ? 1 : 0) : 1,
      admin.ownerId || admin.owner_id || null,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async delete(id) {
    await execute('DELETE FROM admins WHERE id = ?', [id]);
  }
}

module.exports = new AdminRepository();

