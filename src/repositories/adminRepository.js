const { query, execute } = require('../config/database');

class AdminRepository {
  async findById(id) {
    if (!id) return null;
    const rows = await query('SELECT * FROM admins WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByUsername(username) {
    if (!username) return null;
    const rows = await query('SELECT * FROM admins WHERE LOWER(username) = LOWER(?) LIMIT 1', [username.trim()]);
    return rows[0] || null;
  }

  async findByEmail(email) {
    if (!email) return null;
    const rows = await query('SELECT * FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
    return rows[0] || null;
  }

  async findByUsernameOrEmail(identifier) {
    if (!identifier) return null;
    const clean = identifier.trim().toLowerCase();
    const rows = await query(
      'SELECT * FROM admins WHERE LOWER(username) = ? OR LOWER(email) = ? LIMIT 1',
      [clean, clean]
    );
    return rows[0] || null;
  }

  async findByOwner(ownerId) {
    return await query('SELECT * FROM admins WHERE owner_id = ? ORDER BY id ASC', [ownerId]);
  }

  async findByIsActive(isActive) {
    return await query('SELECT * FROM admins WHERE is_active = ? ORDER BY id ASC', [isActive ? 1 : 0]);
  }

  async existsByUsername(username) {
    if (!username) return false;
    const rows = await query('SELECT id FROM admins WHERE LOWER(username) = LOWER(?) LIMIT 1', [username.trim()]);
    return rows.length > 0;
  }

  async existsByEmail(email) {
    if (!email) return false;
    const rows = await query('SELECT id FROM admins WHERE LOWER(email) = LOWER(?) LIMIT 1', [email.trim()]);
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
      admin.password || '$2a$10$e79GZkL1x8a5g8uA3j.xEu1Q5G4IqL9V0U3L.4Y.6gM4O2z7mIe7G',
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

