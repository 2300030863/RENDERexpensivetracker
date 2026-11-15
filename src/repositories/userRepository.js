const { query, execute } = require('../config/database');

class UserRepository {
  async findById(id) {
    const rows = await query('SELECT * FROM users WHERE id = ?', [id]);
    return rows[0] || null;
  }

  async findByIdWithUserGroup(id) {
    const sql = `
      SELECT u.*, 
             ug.id as group_id, ug.name as group_name, ug.description as group_description, ug.admin_id as group_admin_id,
             a.id as direct_admin_id, a.username as direct_admin_username
      FROM users u
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      LEFT JOIN admins a ON u.admin_id = a.id
      WHERE u.id = ?
    `;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findByUsername(username) {
    const rows = await query('SELECT * FROM users WHERE username = ?', [username]);
    return rows[0] || null;
  }

  async findByEmail(email) {
    const rows = await query('SELECT * FROM users WHERE email = ?', [email]);
    return rows[0] || null;
  }

  async findByUsernameOrEmail(identifier) {
    if (!identifier) return null;
    const trimmed = identifier.trim();
    const rows = await query(
      'SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) LIMIT 1',
      [trimmed, trimmed]
    );
    return rows[0] || null;
  }

  async existsByUsername(username) {
    const rows = await query('SELECT id FROM users WHERE username = ? LIMIT 1', [username]);
    return rows.length > 0;
  }

  async existsByEmail(email) {
    const rows = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
    return rows.length > 0;
  }

  async findByRole(role) {
    return await query('SELECT * FROM users WHERE role = ? ORDER BY id ASC', [role]);
  }

  async findByAdmin(adminId) {
    return await query('SELECT * FROM users WHERE admin_id = ? ORDER BY id ASC', [adminId]);
  }

  async findByAdminManagedUsers(adminId) {
    const sql = `
      SELECT DISTINCT u.* 
      FROM users u
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE u.admin_id = ? OR ug.admin_id = ?
      ORDER BY u.id ASC
    `;
    return await query(sql, [adminId, adminId]);
  }

  async findByUserGroupId(groupId) {
    return await query('SELECT * FROM users WHERE user_group_id = ? ORDER BY id ASC', [groupId]);
  }

  async findByUserGroupAdminId(adminId) {
    const sql = `
      SELECT u.* 
      FROM users u
      JOIN user_groups ug ON u.user_group_id = ug.id
      WHERE ug.admin_id = ?
      ORDER BY u.id ASC
    `;
    return await query(sql, [adminId]);
  }

  async findAllExcludingOwnersAndGroupMembers(ownerRole = 'ROLE_OWNER', adminRole = 'ROLE_ADMIN') {
    const sql = `
      SELECT * FROM users 
      WHERE role != ? AND (role = ? OR user_group_id IS NULL)
      ORDER BY id ASC
    `;
    return await query(sql, [ownerRole, adminRole]);
  }

  async create(user) {
    const sql = `
      INSERT INTO users (
        username, email, password, first_name, last_name, country, role, 
        blocked, admin_id, user_group_id, occupation_id, is_oauth_user, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      user.username,
      user.email,
      user.password,
      user.firstName || user.first_name || '',
      user.lastName || user.last_name || '',
      user.country || 'India',
      user.role || 'ROLE_USER',
      user.blocked ? 1 : 0,
      user.adminId || user.admin_id || null,
      user.userGroupId || user.user_group_id || null,
      user.occupationId || user.occupation_id || null,
      user.isOAuthUser || user.is_oauth_user ? 1 : 0,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      username: 'username',
      email: 'email',
      password: 'password',
      firstName: 'first_name',
      first_name: 'first_name',
      lastName: 'last_name',
      last_name: 'last_name',
      country: 'country',
      role: 'role',
      blocked: 'blocked',
      adminId: 'admin_id',
      admin_id: 'admin_id',
      userGroupId: 'user_group_id',
      user_group_id: 'user_group_id',
      occupationId: 'occupation_id',
      occupation_id: 'occupation_id',
      isOAuthUser: 'is_oauth_user',
      is_oauth_user: 'is_oauth_user',
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

    const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('DELETE FROM users WHERE id = ?', [id]);
  }
}

module.exports = new UserRepository();

