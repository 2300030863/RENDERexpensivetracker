const { query, execute } = require('../config/database');

class PasswordResetTokenRepository {
  async findByToken(token) {
    const sql = `
      SELECT t.*, u.id as user_id, u.email as user_email, u.first_name, u.username
      FROM password_reset_tokens t
      JOIN users u ON t.user_id = u.id
      WHERE t.token = ?
    `;
    const rows = await query(sql, [token]);
    return rows[0] || null;
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
  }

  async deleteExpired() {
    await execute('DELETE FROM password_reset_tokens WHERE expiry_date < NOW()');
  }

  async create(token, userId, expiryDate) {
    const sql = `
      INSERT INTO password_reset_tokens (token, user_id, expiry_date, used)
      VALUES (?, ?, ?, 0)
    `;
    const result = await execute(sql, [token, userId, expiryDate]);
    const [row] = await query('SELECT * FROM password_reset_tokens WHERE id = ?', [result.insertId]);
    return row;
  }

  async markUsed(id) {
    await execute('UPDATE password_reset_tokens SET used = 1 WHERE id = ?', [id]);
  }
}

module.exports = new PasswordResetTokenRepository();

