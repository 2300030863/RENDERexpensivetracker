const { query, execute } = require('../config/database');

class PaymentRepository {
  _basePaymentSelect() {
    return `
      SELECT p.*,
             c.name as category_name, c.color as category_color,
             a.name as account_name, a.type as account_type, a.balance as account_balance,
             pr.name as recipient_registered_name, pr.recipient_type as recipient_type, pr.is_favorite as is_favorite_recipient
      FROM payments p
      JOIN categories c ON p.category_id = c.id
      JOIN accounts a ON p.account_id = a.id
      LEFT JOIN payment_recipients pr ON p.recipient_id = pr.id
    `;
  }

  async createPayment({
    userId,
    recipientId = null,
    recipientName,
    upiId = null,
    amount,
    paymentMethod,
    status,
    categoryId,
    accountId,
    transactionId = null,
    paymentDate,
    notes = '',
    referenceId,
    idempotencyKey = null,
    attemptCount = 1,
  }) {
    const sql = `
      INSERT INTO payments (
        user_id, recipient_id, recipient_name, upi_id, amount,
        payment_method, status, category_id, account_id, transaction_id,
        payment_date, notes, reference_id, idempotency_key, attempt_count
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await execute(sql, [
      userId,
      recipientId,
      recipientName,
      upiId,
      amount,
      paymentMethod,
      status,
      categoryId,
      accountId,
      transactionId,
      paymentDate,
      notes,
      referenceId,
      idempotencyKey,
      attemptCount,
    ]);
    return await this.findPaymentById(result.insertId);
  }

  async findPaymentByIdempotencyKey(userId, idempotencyKey) {
    if (!idempotencyKey) return null;
    const sql = `${this._basePaymentSelect()} WHERE p.user_id = ? AND p.idempotency_key = ? LIMIT 1`;
    const rows = await query(sql, [userId, idempotencyKey]);
    return rows[0] || null;
  }

  async updatePaymentAttempt(id, { attemptCount, referenceId, status = 'PENDING' }) {
    const sql = 'UPDATE payments SET attempt_count = ?, reference_id = ?, status = ? WHERE id = ?';
    await execute(sql, [attemptCount, referenceId, status, id]);
    return await this.findPaymentById(id);
  }

  async createPaymentAttemptLog({ paymentId, attemptNumber, status = 'INITIATED', platform = 'web', upiUri }) {
    const sql = `
      INSERT INTO payment_attempts (payment_id, attempt_number, status, platform, upi_uri)
      VALUES (?, ?, ?, ?, ?)
    `;
    const result = await execute(sql, [paymentId, attemptNumber, status, platform, upiUri]);
    return result.insertId;
  }

  async findAttemptsByPaymentId(paymentId) {
    const sql = 'SELECT * FROM payment_attempts WHERE payment_id = ? ORDER BY attempt_number DESC';
    return await query(sql, [paymentId]);
  }

  async findPaymentById(id) {
    const sql = `${this._basePaymentSelect()} WHERE p.id = ?`;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findPaymentByReferenceId(referenceId) {
    const sql = `${this._basePaymentSelect()} WHERE p.reference_id = ?`;
    const rows = await query(sql, [referenceId]);
    return rows[0] || null;
  }

  async findPaymentsByUser(userId, filters = {}, limit = 20, offset = 0) {
    let sql = `${this._basePaymentSelect()} WHERE p.user_id = ?`;
    const params = [userId];

    if (filters.status) {
      sql += ' AND p.status = ?';
      params.push(filters.status);
    }
    if (filters.paymentMethod) {
      sql += ' AND p.payment_method = ?';
      params.push(filters.paymentMethod);
    }
    if (filters.startDate) {
      sql += ' AND p.payment_date >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND p.payment_date <= ?';
      params.push(filters.endDate);
    }
    if (filters.search) {
      sql += ' AND (p.recipient_name LIKE ? OR p.upi_id LIKE ? OR p.notes LIKE ? OR p.reference_id LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }
    if (filters.categoryId) {
      sql += ' AND p.category_id = ?';
      params.push(filters.categoryId);
    }
    if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
      sql += ' AND p.amount >= ?';
      params.push(Number(filters.minAmount));
    }
    if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
      sql += ' AND p.amount <= ?';
      params.push(Number(filters.maxAmount));
    }

    sql += ' ORDER BY p.payment_date DESC, p.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await query(sql, params);
  }

  async countPaymentsByUser(userId, filters = {}) {
    let sql = 'SELECT COUNT(*) as total FROM payments p WHERE p.user_id = ?';
    const params = [userId];

    if (filters.status) {
      sql += ' AND p.status = ?';
      params.push(filters.status);
    }
    if (filters.paymentMethod) {
      sql += ' AND p.payment_method = ?';
      params.push(filters.paymentMethod);
    }
    if (filters.startDate) {
      sql += ' AND p.payment_date >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND p.payment_date <= ?';
      params.push(filters.endDate);
    }
    if (filters.search) {
      sql += ' AND (p.recipient_name LIKE ? OR p.upi_id LIKE ? OR p.notes LIKE ? OR p.reference_id LIKE ?)';
      const term = `%${filters.search}%`;
      params.push(term, term, term, term);
    }
    if (filters.categoryId) {
      sql += ' AND p.category_id = ?';
      params.push(filters.categoryId);
    }
    if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
      sql += ' AND p.amount >= ?';
      params.push(Number(filters.minAmount));
    }
    if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
      sql += ' AND p.amount <= ?';
      params.push(Number(filters.maxAmount));
    }

    const rows = await query(sql, params);
    return rows[0] ? rows[0].total : 0;
  }

  async updatePaymentStatus(id, status, transactionId = null) {
    let sql = 'UPDATE payments SET status = ?';
    const params = [status];

    if (transactionId !== null) {
      sql += ', transaction_id = ?';
      params.push(transactionId);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    await execute(sql, params);
    return await this.findPaymentById(id);
  }

  // --- Recipient Management ---

  async findRecipientById(id) {
    const sql = 'SELECT * FROM payment_recipients WHERE id = ?';
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findRecipientByUserAndNameOrUpi(userId, name, upiId = null) {
    if (upiId) {
      const sql = 'SELECT * FROM payment_recipients WHERE user_id = ? AND (name = ? OR upi_id = ?) LIMIT 1';
      const rows = await query(sql, [userId, name, upiId]);
      return rows[0] || null;
    }
    const sql = 'SELECT * FROM payment_recipients WHERE user_id = ? AND name = ? LIMIT 1';
    const rows = await query(sql, [userId, name]);
    return rows[0] || null;
  }

  async createRecipient({ userId, name, upiId = null, phone = null, recipientType = 'FRIEND', isFavorite = false }) {
    const sql = `
      INSERT INTO payment_recipients (user_id, name, upi_id, phone, recipient_type, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await execute(sql, [userId, name, upiId, phone, recipientType, isFavorite]);
    return await this.findRecipientById(result.insertId);
  }

  async updateRecipient(id, { name, upiId = null, phone = null, recipientType, isFavorite }) {
    let updates = [];
    const params = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (upiId !== undefined) {
      updates.push('upi_id = ?');
      params.push(upiId);
    }
    if (phone !== undefined) {
      updates.push('phone = ?');
      params.push(phone);
    }
    if (recipientType !== undefined) {
      updates.push('recipient_type = ?');
      params.push(recipientType);
    }
    if (isFavorite !== undefined) {
      updates.push('is_favorite = ?');
      params.push(isFavorite);
    }

    if (updates.length === 0) return await this.findRecipientById(id);

    const sql = `UPDATE payment_recipients SET ${updates.join(', ')} WHERE id = ?`;
    params.push(id);
    await execute(sql, params);
    return await this.findRecipientById(id);
  }

  async touchRecipient(id) {
    const sql = 'UPDATE payment_recipients SET updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    await execute(sql, [id]);
  }

  async findRecentRecipientsByUser(userId, limit = 8) {
    const sql = `
      SELECT * FROM payment_recipients
      WHERE user_id = ?
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `;
    return await query(sql, [userId, limit]);
  }

  async findFavoriteRecipientsByUser(userId) {
    const sql = `
      SELECT * FROM payment_recipients
      WHERE user_id = ? AND is_favorite = TRUE
      ORDER BY name ASC
    `;
    return await query(sql, [userId]);
  }

  async findRecipientsByUser(userId, searchQuery = '') {
    let sql = 'SELECT * FROM payment_recipients WHERE user_id = ?';
    const params = [userId];

    if (searchQuery) {
      sql += ' AND (name LIKE ? OR upi_id LIKE ? OR phone LIKE ?)';
      const term = `%${searchQuery}%`;
      params.push(term, term, term);
    }

    sql += ' ORDER BY is_favorite DESC, updated_at DESC, name ASC';
    return await query(sql, params);
  }

  async toggleFavoriteRecipient(id, userId) {
    const recipient = await this.findRecipientById(id);
    if (!recipient || recipient.user_id !== userId) return null;

    const newFavorite = !recipient.is_favorite;
    await execute('UPDATE payment_recipients SET is_favorite = ? WHERE id = ?', [newFavorite, id]);
    return await this.findRecipientById(id);
  }

  async deleteRecipient(id, userId) {
    const sql = 'DELETE FROM payment_recipients WHERE id = ? AND user_id = ?';
    const result = await execute(sql, [id, userId]);
    return result.affectedRows > 0;
  }
}

module.exports = new PaymentRepository();
