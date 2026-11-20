const { query, execute, withTransaction } = require('../config/database');
const { badRequest, notFound } = require('../utils/httpError');
const { toDateStr, addPeriod } = require('../utils/dateUtil');

// Safety valve: never post more than this many back-dated occurrences in one run.
const MAX_CATCH_UP_OCCURRENCES = 366;

class RecurringTransactionRepository {
  _baseSelect() {
    return `
      SELECT rt.*,
             c.id as category_id, c.name as category_name, c.color as category_color,
             a.id as account_id, a.name as account_name, a.type as account_type,
             u.id as user_owner_id, u.username as user_owner_username, u.user_group_id as user_group_id,
             ug.admin_id as group_admin_id,
             adm.username as group_admin_username
      FROM recurring_transactions rt
      JOIN categories c ON rt.category_id = c.id
      JOIN accounts a ON rt.account_id = a.id
      JOIN users u ON rt.user_id = u.id
      LEFT JOIN user_groups ug ON u.user_group_id = ug.id
      LEFT JOIN admins adm ON ug.admin_id = adm.id
    `;
  }

  async findById(id) {
    const sql = `${this._baseSelect()} WHERE rt.id = ?`;
    const rows = await query(sql, [id]);
    return rows[0] || null;
  }

  async findByUserOrderByNextDueDateAsc(userId) {
    const sql = `${this._baseSelect()} WHERE rt.user_id = ? ORDER BY rt.next_due_date ASC`;
    return await query(sql, [userId]);
  }

  async findByUserAndIsActiveTrueOrderByNextDueDateAsc(userId) {
    const sql = `${this._baseSelect()} WHERE rt.user_id = ? AND rt.is_active = 1 ORDER BY rt.next_due_date ASC`;
    return await query(sql, [userId]);
  }

  async findByUserGroupOrderByNextDueDateAsc(groupId) {
    const sql = `
      ${this._baseSelect()}
      WHERE u.user_group_id = ?
      ORDER BY rt.next_due_date ASC
    `;
    return await query(sql, [groupId]);
  }

  async findByUserGroupAndIsActiveTrueOrderByNextDueDateAsc(groupId) {
    const sql = `
      ${this._baseSelect()}
      WHERE u.user_group_id = ? AND rt.is_active = 1
      ORDER BY rt.next_due_date ASC
    `;
    return await query(sql, [groupId]);
  }

  async findDueRecurringTransactions(userId, date) {
    const sql = `
      ${this._baseSelect()}
      WHERE rt.user_id = ? AND rt.is_active = 1 
      AND rt.next_due_date <= ? 
      AND (rt.end_date IS NULL OR rt.end_date >= ?)
    `;
    return await query(sql, [userId, date, date]);
  }

  async findAllDue(date) {
    const sql = `
      ${this._baseSelect()}
      WHERE rt.is_active = 1 
      AND rt.next_due_date <= ? 
      AND (rt.end_date IS NULL OR rt.end_date >= ?)
    `;
    return await query(sql, [date, date]);
  }

  /**
   * IDs of every active schedule whose next due date has arrived. Schedules whose
   * end date has passed are included on purpose so they get switched off.
   */
  async findDueIds(date) {
    const rows = await query(
      'SELECT id FROM recurring_transactions WHERE is_active = 1 AND next_due_date <= ? ORDER BY next_due_date ASC, id ASC',
      [date]
    );
    return rows.map((r) => r.id);
  }

  /**
   * Post occurrences of one schedule atomically.
   *
   *  - automatic run: posts every occurrence that is due on or before `today`
   *    (catching up days the server missed), each dated with its own due date.
   *  - manual run: posts exactly one occurrence dated `today` and moves the schedule forward.
   *
   * The schedule and account rows are locked (SELECT ... FOR UPDATE) so concurrent runs - a double
   * click, two server instances, the hourly job racing a manual run - can never post the same
   * occurrence twice. Everything is committed together or rolled back together.
   */
  async processOccurrences(id, { today, manual = false }) {
    return withTransaction(async (conn) => {
      const [rows] = await conn.query('SELECT * FROM recurring_transactions WHERE id = ? FOR UPDATE', [id]);
      const rt = rows[0];
      if (!rt) throw notFound('Recurring transaction not found');

      const inactive = !(rt.is_active === 1 || rt.is_active === true);
      if (inactive) {
        if (manual) throw badRequest('Cannot execute inactive recurring transaction');
        return { created: 0, blocked: null, isActive: false, nextDueDate: toDateStr(rt.next_due_date) };
      }

      if (manual) {
        // A second click a moment after the first must not post the same payment twice.
        const [recent] = await conn.query(
          'SELECT id FROM transactions WHERE recurring_transaction_id = ? AND created_at >= (NOW() - INTERVAL 10 SECOND) LIMIT 1',
          [id]
        );
        if (recent.length > 0) {
          throw badRequest('This schedule was just executed. Please wait a moment before running it again.');
        }
      }

      const startStr = toDateStr(rt.start_date);
      const endStr = toDateStr(rt.end_date);
      const anchorDay = Number(startStr.slice(8, 10));
      const amount = Number(rt.amount);
      let nextDue = toDateStr(rt.next_due_date) || startStr;

      let created = 0;
      let isActive = true;
      let blocked = null;
      let availableBalance = null;
      const maxRuns = manual ? 1 : MAX_CATCH_UP_OCCURRENCES;

      while (created < maxRuns) {
        if (!manual && nextDue > today) break;

        if (endStr && nextDue > endStr) {
          isActive = false; // schedule has run its course
          break;
        }

        const [accounts] = await conn.query('SELECT id, balance, is_active FROM accounts WHERE id = ? FOR UPDATE', [
          rt.account_id,
        ]);
        const account = accounts[0];
        const accountActive = account && (account.is_active === 1 || account.is_active === true);
        if (!accountActive) {
          blocked = 'ACCOUNT_UNAVAILABLE';
          break;
        }

        if (rt.type === 'EXPENSE' && Number(account.balance) < amount) {
          blocked = 'INSUFFICIENT_BALANCE';
          availableBalance = Number(account.balance);
          break;
        }

        await conn.query(
          `INSERT INTO transactions (
             amount, description, type, transaction_date, notes,
             user_id, category_id, account_id, recurring_transaction_id, admin_id, is_approved, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, NOW())`,
          [
            amount,
            rt.description,
            rt.type,
            manual ? today : nextDue,
            rt.notes || '',
            rt.user_id,
            rt.category_id,
            rt.account_id,
            rt.id,
          ]
        );
        await conn.query(
          `UPDATE accounts SET balance = balance ${rt.type === 'INCOME' ? '+' : '-'} ?, updated_at = NOW() WHERE id = ?`,
          [amount, rt.account_id]
        );

        created += 1;
        nextDue = addPeriod(nextDue, rt.recurrence_type, anchorDay);

        if (endStr && nextDue > endStr) {
          isActive = false;
          break;
        }
      }

      if (manual && blocked) {
        if (blocked === 'INSUFFICIENT_BALANCE') {
          throw badRequest(`Insufficient balance in account. Available balance: ${availableBalance}`);
        }
        throw badRequest('The linked account is no longer available. Edit the schedule and choose another account.');
      }

      if (created > 0 || !isActive) {
        await conn.query(
          'UPDATE recurring_transactions SET next_due_date = ?, is_active = ?, updated_at = NOW() WHERE id = ?',
          [nextDue, isActive ? 1 : 0, id]
        );
      }

      return { created, blocked, isActive, nextDueDate: nextDue };
    });
  }

  async create(rt) {
    const sql = `
      INSERT INTO recurring_transactions (
        description, amount, type, recurrence_type, start_date, end_date, next_due_date, notes, is_active, user_id, category_id, account_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `;
    const params = [
      rt.description,
      parseFloat(rt.amount),
      rt.type,
      rt.recurrenceType || rt.recurrence_type,
      rt.startDate || rt.start_date,
      rt.endDate || rt.end_date || null,
      rt.nextDueDate || rt.next_due_date,
      rt.notes || '',
      rt.isActive !== undefined ? (rt.isActive ? 1 : 0) : 1,
      rt.userId || rt.user_id,
      rt.categoryId || rt.category_id,
      rt.accountId || rt.account_id,
    ];
    const result = await execute(sql, params);
    return await this.findById(result.insertId);
  }

  async update(id, fields) {
    const updates = [];
    const params = [];

    const fieldMap = {
      description: 'description',
      amount: 'amount',
      type: 'type',
      recurrenceType: 'recurrence_type',
      recurrence_type: 'recurrence_type',
      startDate: 'start_date',
      start_date: 'start_date',
      endDate: 'end_date',
      end_date: 'end_date',
      nextDueDate: 'next_due_date',
      next_due_date: 'next_due_date',
      notes: 'notes',
      isActive: 'is_active',
      is_active: 'is_active',
      categoryId: 'category_id',
      category_id: 'category_id',
      accountId: 'account_id',
      account_id: 'account_id',
    };

    for (const [key, val] of Object.entries(fields)) {
      if (fieldMap[key] !== undefined) {
        updates.push(`${fieldMap[key]} = ?`);
        if (typeof val === 'boolean') {
          params.push(val ? 1 : 0);
        } else if (key === 'amount') {
          params.push(parseFloat(val));
        } else {
          params.push(val);
        }
      }
    }

    if (updates.length === 0) return await this.findById(id);

    updates.push('updated_at = NOW()');
    params.push(id);

    const sql = `UPDATE recurring_transactions SET ${updates.join(', ')} WHERE id = ?`;
    await execute(sql, params);
    return await this.findById(id);
  }

  async delete(id) {
    await execute('DELETE FROM recurring_transactions WHERE id = ?', [id]);
  }

  async deleteByUserId(userId) {
    await execute('DELETE FROM recurring_transactions WHERE user_id = ?', [userId]);
  }
}

module.exports = new RecurringTransactionRepository();

