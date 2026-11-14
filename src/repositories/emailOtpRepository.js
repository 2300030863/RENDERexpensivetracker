const { query, execute } = require('../config/database');

class EmailOtpRepository {
  async findLatestUnverifiedByEmail(email) {
    const sql = `
      SELECT * FROM email_otps 
      WHERE email = ? AND verified = 0 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const rows = await query(sql, [email]);
    return rows[0] || null;
  }

  async findLatestVerifiedByEmail(email) {
    const sql = `
      SELECT * FROM email_otps 
      WHERE email = ? AND verified = 1 
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    const rows = await query(sql, [email]);
    return rows[0] || null;
  }

  async deleteByEmail(email) {
    await execute('DELETE FROM email_otps WHERE email = ?', [email]);
  }

  async create(email, otp, expiresAt) {
    const sql = `
      INSERT INTO email_otps (email, otp, verified, expires_at)
      VALUES (?, ?, 0, ?)
    `;
    const result = await execute(sql, [email, otp, expiresAt]);
    const [row] = await query('SELECT * FROM email_otps WHERE id = ?', [result.insertId]);
    return row;
  }

  async markVerified(id) {
    await execute('UPDATE email_otps SET verified = 1 WHERE id = ?', [id]);
  }

  async incrementAttempts(id) {
    try {
      await execute('UPDATE email_otps SET attempts = COALESCE(attempts, 0) + 1 WHERE id = ?', [id]);
    } catch (_) {}
  }
}

module.exports = new EmailOtpRepository();

