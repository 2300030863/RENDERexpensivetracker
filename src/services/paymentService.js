const crypto = require('crypto');
const paymentRepository = require('../repositories/paymentRepository');
const transactionRepository = require('../repositories/transactionRepository');
const accountRepository = require('../repositories/accountRepository');
const accountService = require('./accountService');
const categoryService = require('./categoryService');
const { withTransaction } = require('../config/database');
const { badRequest, notFound, forbidden } = require('../utils/httpError');
const { isValidDateStr, toDateStr } = require('../utils/dateUtil');

// NPCI standard limit is ₹1,00,000 per UPI transaction
const MAX_UPI_AMOUNT = 100000.00;
// Prudent application limit for cash payments
const MAX_CASH_AMOUNT = 200000.00;

// Standard NPCI UPI VPA format: user@bank (2-256 chars before @, 2-64 chars after @)
const UPI_ID_REGEX = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;

function buildUpiPaymentUri({ upiId, recipientName, amount, note = '', referenceId = '' }) {
  if (!upiId || typeof upiId !== 'string' || !UPI_ID_REGEX.test(upiId.trim())) {
    throw badRequest('Invalid or missing recipient UPI ID');
  }
  const cleanName = typeof recipientName === 'string' ? recipientName.trim().slice(0, 100) : '';
  if (!cleanName) {
    throw badRequest('Recipient name is required');
  }
  const numAmount = Number(amount);
  if (!Number.isFinite(numAmount) || numAmount <= 0) {
    throw badRequest('Amount must be positive');
  }
  if (numAmount > MAX_UPI_AMOUNT) {
    throw badRequest(`Amount exceeds maximum supported UPI transaction limit of ₹${MAX_UPI_AMOUNT.toLocaleString('en-IN')}`);
  }

  // NPCI standard note length (tn) is 50 chars in most UPI apps (GPay, PhonePe, Paytm)
  const cleanNote = typeof note === 'string' ? note.trim().slice(0, 50) : '';

  const params = [
    `pa=${encodeURIComponent(upiId.trim())}`,
    `pn=${encodeURIComponent(cleanName)}`,
    `am=${encodeURIComponent(numAmount.toFixed(2))}`,
    `cu=INR`,
  ];

  if (cleanNote) {
    params.push(`tn=${encodeURIComponent(cleanNote)}`);
  }
  if (referenceId) {
    params.push(`tr=${encodeURIComponent(String(referenceId).trim())}`);
  }

  return `upi://pay?${params.join('&')}`;
}

function validateAndParsePaymentInput(request) {
  // 1. Recipient Name
  const recipientName = typeof request.recipientName === 'string' ? request.recipientName.trim() : '';
  if (!recipientName || recipientName.length < 2 || recipientName.length > 150) {
    throw badRequest('Recipient name is required (2 to 150 characters)');
  }

  // 2. Payment Method
  const paymentMethod = typeof request.paymentMethod === 'string' ? request.paymentMethod.toUpperCase().trim() : '';
  if (paymentMethod !== 'UPI' && paymentMethod !== 'CASH') {
    throw badRequest('Payment method must be either UPI or CASH');
  }

  // 3. Amount Validation
  const rawAmount = Number(request.amount);
  if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
    throw badRequest('Amount must be a valid positive number greater than 0');
  }
  // Check decimal places (max 2 decimal places)
  if (!/^\d+(\.\d{1,2})?$/.test(String(request.amount))) {
    throw badRequest('Amount cannot have more than 2 decimal places');
  }
  const amount = Math.round(rawAmount * 100) / 100;

  if (paymentMethod === 'UPI' && amount > MAX_UPI_AMOUNT) {
    throw badRequest(`Amount exceeds maximum supported UPI transaction limit of ₹${MAX_UPI_AMOUNT.toLocaleString('en-IN')}`);
  }
  if (paymentMethod === 'CASH' && amount > MAX_CASH_AMOUNT) {
    throw badRequest(`Amount exceeds maximum supported cash transaction limit of ₹${MAX_CASH_AMOUNT.toLocaleString('en-IN')}`);
  }

  // 4. UPI ID Validation
  let upiId = typeof request.upiId === 'string' ? request.upiId.trim() : null;
  if (paymentMethod === 'UPI') {
    if (!upiId) {
      throw badRequest('Recipient UPI ID is required for UPI payments');
    }
    if (!UPI_ID_REGEX.test(upiId)) {
      throw badRequest('Invalid UPI ID format. Standard format is username@bank (e.g. rahul@oksbi, store@upi)');
    }
  } else {
    // For Cash, upiId is optional
    if (upiId && !UPI_ID_REGEX.test(upiId)) {
      upiId = null;
    }
  }

  // 5. Payment Date
  const rawDate = request.paymentDate || request.payment_date;
  const paymentDate = rawDate ? (typeof rawDate === 'string' ? rawDate.slice(0, 10) : toDateStr(rawDate)) : toDateStr(new Date());
  if (!isValidDateStr(paymentDate)) {
    throw badRequest('A valid payment date (YYYY-MM-DD) is required');
  }

  // 6. Notes
  const notes = typeof request.notes === 'string' ? request.notes.trim() : '';
  if (notes.length > 500) {
    throw badRequest('Payment note must not exceed 500 characters');
  }

  // 7. Recipient Type (friend, family, shop, merchant, other)
  let recipientType = typeof request.recipientType === 'string' ? request.recipientType.toUpperCase().trim() : 'FRIEND';
  const validTypes = ['FRIEND', 'FAMILY', 'SHOP', 'MERCHANT', 'OTHER'];
  if (!validTypes.includes(recipientType)) {
    recipientType = 'OTHER';
  }

  // 8. Cash Handed Over Confirmation
  const isCashHandedOver = Boolean(request.isCashHandedOver || request.is_cash_handed_over);

  return {
    recipientName,
    paymentMethod,
    amount,
    upiId,
    paymentDate,
    notes,
    recipientType,
    isCashHandedOver,
  };
}

async function requireVisibleAccount(user, accountId) {
  const id = Number(accountId);
  if (!id) throw badRequest('Valid account is required');
  const accounts = await accountService.getAllAccounts(user);
  const account = accounts.find((a) => Number(a.id) === id);
  if (!account) throw badRequest('Selected account not found or access denied');
  return account;
}

async function requireVisibleCategory(user, categoryId) {
  const id = Number(categoryId);
  if (!id) throw badRequest('Valid category is required');
  const categories = await categoryService.getAllCategories(user);
  const category = categories.find((c) => Number(c.id) === id);
  if (!category) throw badRequest('Selected category not found or access denied');
  return category;
}

function formatPaymentDto(p, currentUserId) {
  let formattedDate = p.payment_date;
  if (formattedDate instanceof Date) {
    formattedDate = formattedDate.toISOString().split('T')[0];
  }

  return {
    id: p.id,
    userId: p.user_id,
    recipientId: p.recipient_id,
    recipientName: p.recipient_name,
    recipientType: p.recipient_type || 'FRIEND',
    isFavoriteRecipient: Boolean(p.is_favorite_recipient),
    upiId: p.upi_id || null,
    amount: parseFloat(p.amount),
    paymentMethod: p.payment_method,
    status: p.status,
    categoryId: p.category_id,
    categoryName: p.category_name,
    categoryColor: p.category_color,
    accountId: p.account_id,
    accountName: p.account_name,
    accountType: p.account_type,
    accountBalance: parseFloat(p.account_balance || 0),
    transactionId: p.transaction_id,
    paymentDate: formattedDate,
    notes: p.notes || '',
    referenceId: p.reference_id,
    idempotencyKey: p.idempotency_key || null,
    attemptCount: p.attempt_count || 1,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    isOwner: p.user_id === currentUserId,
  };
}

function formatRecipientDto(r) {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    upiId: r.upi_id || null,
    phone: r.phone || null,
    recipientType: r.recipient_type || 'FRIEND',
    isFavorite: Boolean(r.is_favorite),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

class PaymentService {
  async createPayment(user, request) {
    const input = validateAndParsePaymentInput(request);
    const category = await requireVisibleCategory(user, request.categoryId || request.category_id);
    const account = await requireVisibleAccount(user, request.accountId || request.account_id);

    // 1. Upsert / associate recipient
    let recipient = await paymentRepository.findRecipientByUserAndNameOrUpi(user.id, input.recipientName, input.upiId);
    if (!recipient) {
      recipient = await paymentRepository.createRecipient({
        userId: user.id,
        name: input.recipientName,
        upiId: input.upiId,
        phone: request.phone || null,
        recipientType: input.recipientType,
        isFavorite: Boolean(request.isFavorite),
      });
    } else {
      // Refresh activity timestamp and update UPI if newly provided
      const updates = {};
      if (input.upiId && (!recipient.upi_id || recipient.upi_id !== input.upiId)) {
        updates.upiId = input.upiId;
      }
      if (input.recipientType && recipient.recipient_type !== input.recipientType) {
        updates.recipientType = input.recipientType;
      }
      if (Object.keys(updates).length > 0) {
        recipient = await paymentRepository.updateRecipient(recipient.id, updates);
      } else {
        await paymentRepository.touchRecipient(recipient.id);
      }
    }

    const referenceId = `PAY-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    // 2. CASH Payment handling
    if (input.paymentMethod === 'CASH') {
      if (input.isCashHandedOver) {
        // Explicitly confirmed that cash was handed over -> Create expense record and set status CASH_PAID
        const currentBalance = parseFloat(account.balance || 0);
        if (currentBalance < input.amount) {
          throw badRequest(`Insufficient balance in account "${account.name}". Available balance: ₹${currentBalance.toFixed(2)}`);
        }

        const noteText = input.notes
          ? `[Cash Paid to: ${input.recipientName}] ${input.notes}`
          : `Cash Paid to: ${input.recipientName}`;

        const createdTxn = await transactionRepository.create({
          amount: input.amount,
          description: `Cash payment to ${input.recipientName}`,
          type: 'EXPENSE',
          transactionDate: input.paymentDate,
          notes: noteText.slice(0, 500),
          userId: user.id,
          categoryId: category.id,
          accountId: account.id,
          recurringTransactionId: null,
          adminId: user.admin_id || null,
        });

        // Deduct account balance
        await accountRepository.updateBalance(account.id, input.amount, 'EXPENSE');

        const payment = await paymentRepository.createPayment({
          userId: user.id,
          recipientId: recipient.id,
          recipientName: input.recipientName,
          upiId: input.upiId,
          amount: input.amount,
          paymentMethod: 'CASH',
          status: 'CASH_PAID',
          categoryId: category.id,
          accountId: account.id,
          transactionId: createdTxn.id,
          paymentDate: input.paymentDate,
          notes: input.notes,
          referenceId,
        });

        return formatPaymentDto(payment, user.id);
      } else {
        // Cash not confirmed as handed over yet -> Save as PENDING without creating an expense record yet
        const payment = await paymentRepository.createPayment({
          userId: user.id,
          recipientId: recipient.id,
          recipientName: input.recipientName,
          upiId: input.upiId,
          amount: input.amount,
          paymentMethod: 'CASH',
          status: 'PENDING',
          categoryId: category.id,
          accountId: account.id,
          transactionId: null,
          paymentDate: input.paymentDate,
          notes: input.notes,
          referenceId,
        });

        return formatPaymentDto(payment, user.id);
      }
    }

    // 3. UPI Payment handling
    // When UPI is selected: save attempt as PENDING before launching external UPI application.
    // Do NOT mark transaction successful yet. Do NOT create duplicate transaction.
    const payment = await paymentRepository.createPayment({
      userId: user.id,
      recipientId: recipient.id,
      recipientName: input.recipientName,
      upiId: input.upiId,
      amount: input.amount,
      paymentMethod: 'UPI',
      status: 'PENDING',
      categoryId: category.id,
      accountId: account.id,
      transactionId: null,
      paymentDate: input.paymentDate,
      notes: input.notes,
      referenceId,
    });

    return formatPaymentDto(payment, user.id);
  }

  async initiateUpiPayment(user, request) {
    // 1. Idempotency check: if client supplied an idempotencyKey, return existing if present
    const idempotencyKey = typeof request.idempotencyKey === 'string' ? request.idempotencyKey.trim().slice(0, 100) : null;
    if (idempotencyKey) {
      const existing = await paymentRepository.findPaymentByIdempotencyKey(user.id, idempotencyKey);
      if (existing) {
        const upiUri = buildUpiPaymentUri({
          upiId: existing.upi_id,
          recipientName: existing.recipient_name,
          amount: existing.amount,
          note: existing.notes,
          referenceId: existing.reference_id,
        });
        return {
          payment: formatPaymentDto(existing, user.id),
          upiUri,
          referenceId: existing.reference_id,
          isDuplicate: true,
        };
      }
    }

    const input = validateAndParsePaymentInput({ ...request, paymentMethod: 'UPI' });
    const category = await requireVisibleCategory(user, request.categoryId || request.category_id);
    const account = await requireVisibleAccount(user, request.accountId || request.account_id);

    // 2. Upsert recipient
    let recipient = await paymentRepository.findRecipientByUserAndNameOrUpi(user.id, input.recipientName, input.upiId);
    if (!recipient) {
      recipient = await paymentRepository.createRecipient({
        userId: user.id,
        name: input.recipientName,
        upiId: input.upiId,
        phone: request.phone || null,
        recipientType: input.recipientType,
        isFavorite: Boolean(request.isFavorite),
      });
    } else {
      await paymentRepository.touchRecipient(recipient.id);
    }

    const referenceId = `UPI-TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const upiUri = buildUpiPaymentUri({
      upiId: input.upiId,
      recipientName: input.recipientName,
      amount: input.amount,
      note: input.notes,
      referenceId,
    });

    // 3. Save payment attempt as PENDING before launching external UPI app
    const payment = await paymentRepository.createPayment({
      userId: user.id,
      recipientId: recipient.id,
      recipientName: input.recipientName,
      upiId: input.upiId,
      amount: input.amount,
      paymentMethod: 'UPI',
      status: 'PENDING',
      categoryId: category.id,
      accountId: account.id,
      transactionId: null,
      paymentDate: input.paymentDate,
      notes: input.notes,
      referenceId,
      idempotencyKey,
      attemptCount: 1,
    });

    // 4. Log attempt
    const platform = typeof request.platform === 'string' ? request.platform.trim().slice(0, 50) : 'web';
    try {
      await paymentRepository.createPaymentAttemptLog({
        paymentId: payment.id,
        attemptNumber: 1,
        status: 'INITIATED',
        platform,
        upiUri,
      });
    } catch (_) {}

    return {
      payment: formatPaymentDto(payment, user.id),
      upiUri,
      referenceId,
      isDuplicate: false,
    };
  }

  async retryPayment(user, id, { platform = 'web' } = {}) {
    const paymentId = parseInt(id, 10);
    if (!paymentId) throw badRequest('Invalid payment ID');

    const payment = await paymentRepository.findPaymentById(paymentId);
    if (!payment) throw notFound('Payment record not found');

    if (payment.user_id !== user.id) {
      throw forbidden('Access denied: You cannot retry another user payment');
    }

    if (payment.status === 'SUCCESS' || payment.status === 'CASH_PAID') {
      throw badRequest('This payment has already been completed and cannot be retried');
    }

    // Reuse existing payment record without creating duplicate expense or payment row
    const newAttemptCount = (payment.attempt_count || 1) + 1;
    const newReferenceId = `UPI-TXN-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const upiUri = buildUpiPaymentUri({
      upiId: payment.upi_id,
      recipientName: payment.recipient_name,
      amount: payment.amount,
      note: payment.notes,
      referenceId: newReferenceId,
    });

    const updated = await paymentRepository.updatePaymentAttempt(paymentId, {
      attemptCount: newAttemptCount,
      referenceId: newReferenceId,
      status: 'PENDING',
    });

    try {
      await paymentRepository.createPaymentAttemptLog({
        paymentId,
        attemptNumber: newAttemptCount,
        status: 'INITIATED',
        platform,
        upiUri,
      });
    } catch (_) {}

    return {
      payment: formatPaymentDto(updated, user.id),
      upiUri,
      referenceId: newReferenceId,
    };
  }

  async updatePaymentStatus(user, id, { status, confirmationNotes = '' }) {
    const paymentId = parseInt(id, 10);
    if (!paymentId) throw badRequest('Invalid payment ID');

    const payment = await paymentRepository.findPaymentById(paymentId);
    if (!payment) throw notFound('Payment record not found');

    if (payment.user_id !== user.id) {
      throw forbidden('Access denied: You cannot update another user payment');
    }

    const validStatuses = ['PENDING', 'SUCCESS', 'FAILED', 'CANCELLED', 'UNKNOWN', 'UNVERIFIED'];
    const targetStatus = typeof status === 'string' ? status.toUpperCase().trim() : '';
    if (!validStatuses.includes(targetStatus)) {
      throw badRequest(`Invalid status. Must be one of: ${validStatuses.join(', ')}`);
    }

    // If confirming payment as SUCCESS
    if (targetStatus === 'SUCCESS') {
      // Idempotency: if transaction_id is already set, don't create duplicate expense!
      if (payment.transaction_id) {
        const updated = await paymentRepository.updatePaymentStatus(paymentId, 'SUCCESS');
        return formatPaymentDto(updated, user.id);
      }

      // Check account balance before recording
      const account = await accountRepository.findById(payment.account_id);
      if (account) {
        const currentBalance = parseFloat(account.balance || 0);
        if (currentBalance < payment.amount) {
          throw badRequest(`Insufficient balance in account "${account.name}". Available balance: ₹${currentBalance.toFixed(2)}`);
        }
      }

      const noteText = [
        payment.upi_id ? `[UPI to: ${payment.upi_id} | Ref: ${payment.reference_id}]` : `[Payment to: ${payment.recipient_name}]`,
        payment.notes,
        confirmationNotes ? `(Confirmed: ${confirmationNotes})` : '',
      ].filter(Boolean).join(' ');

      const createdTxn = await transactionRepository.create({
        amount: payment.amount,
        description: `UPI payment to ${payment.recipient_name}`,
        type: 'EXPENSE',
        transactionDate: payment.payment_date,
        notes: noteText.slice(0, 500),
        userId: user.id,
        categoryId: payment.category_id,
        accountId: payment.account_id,
        recurringTransactionId: null,
        adminId: user.admin_id || null,
      });

      // Deduct account balance
      await accountRepository.updateBalance(payment.account_id, payment.amount, 'EXPENSE');

      const updated = await paymentRepository.updatePaymentStatus(paymentId, 'SUCCESS', createdTxn.id);
      return formatPaymentDto(updated, user.id);
    }

    // For UNVERIFIED, UNKNOWN, FAILED, CANCELLED, PENDING
    const updated = await paymentRepository.updatePaymentStatus(paymentId, targetStatus);
    return formatPaymentDto(updated, user.id);
  }

  async getPaymentAttempts(user, id) {
    const paymentId = parseInt(id, 10);
    if (!paymentId) throw badRequest('Invalid payment ID');

    const payment = await paymentRepository.findPaymentById(paymentId);
    if (!payment) throw notFound('Payment record not found');

    if (payment.user_id !== user.id && user.role !== 'ROLE_OWNER') {
      throw forbidden('Access denied');
    }

    return await paymentRepository.findAttemptsByPaymentId(paymentId);
  }

  async getPayments(user, queryParams = {}) {
    const page = Math.max(0, parseInt(queryParams.page, 10) || 0);
    const size = Math.min(100, Math.max(1, parseInt(queryParams.size, 10) || 20));
    const offset = page * size;

    const filters = {
      status: queryParams.status || null,
      paymentMethod: queryParams.paymentMethod || null,
      startDate: queryParams.startDate || null,
      endDate: queryParams.endDate || null,
      search: queryParams.search ? queryParams.search.trim() : null,
      categoryId: queryParams.categoryId ? Number(queryParams.categoryId) : null,
      minAmount: queryParams.minAmount ? Number(queryParams.minAmount) : null,
      maxAmount: queryParams.maxAmount ? Number(queryParams.maxAmount) : null,
    };

    const [payments, total] = await Promise.all([
      paymentRepository.findPaymentsByUser(user.id, filters, size, offset),
      paymentRepository.countPaymentsByUser(user.id, filters),
    ]);

    const totalPages = Math.ceil(total / size);

    return {
      content: payments.map((p) => formatPaymentDto(p, user.id)),
      totalElements: total,
      totalPages,
      page,
      size,
      first: page === 0,
      last: page >= totalPages - 1,
      empty: payments.length === 0,
    };
  }

  async getPaymentById(user, id) {
    const paymentId = parseInt(id, 10);
    if (!paymentId) throw badRequest('Invalid payment ID');

    const payment = await paymentRepository.findPaymentById(paymentId);
    if (!payment) throw notFound('Payment record not found');

    if (payment.user_id !== user.id && user.role !== 'ROLE_OWNER') {
      throw forbidden('Access denied: You do not own this payment record');
    }

    const attempts = await paymentRepository.findAttemptsByPaymentId(paymentId);
    const dto = formatPaymentDto(payment, user.id);
    return {
      ...dto,
      attempts: attempts.map((a) => ({
        id: a.id,
        attemptNumber: a.attempt_number,
        status: a.status,
        platform: a.platform,
        upiUri: a.upi_uri,
        createdAt: a.created_at,
      })),
    };
  }

  async cancelPayment(user, id) {
    const paymentId = parseInt(id, 10);
    if (!paymentId) throw badRequest('Invalid payment ID');

    const payment = await paymentRepository.findPaymentById(paymentId);
    if (!payment) throw notFound('Payment record not found');

    if (payment.user_id !== user.id) {
      throw forbidden('Access denied: You cannot cancel another user payment');
    }

    if (payment.status !== 'PENDING') {
      throw badRequest(`Cannot cancel payment with status "${payment.status}"`);
    }

    const updated = await paymentRepository.updatePaymentStatus(paymentId, 'CANCELLED');
    return formatPaymentDto(updated, user.id);
  }

  // --- Recipient Management Services ---

  async getRecipients(user, searchQuery = '') {
    const recipients = await paymentRepository.findRecipientsByUser(user.id, searchQuery);
    return recipients.map(formatRecipientDto);
  }

  async getRecentRecipients(user, limit = 8) {
    const recipients = await paymentRepository.findRecentRecipientsByUser(user.id, Math.min(20, limit));
    return recipients.map(formatRecipientDto);
  }

  async getFavoriteRecipients(user) {
    const recipients = await paymentRepository.findFavoriteRecipientsByUser(user.id);
    return recipients.map(formatRecipientDto);
  }

  async createRecipient(user, request) {
    const name = typeof request.name === 'string' ? request.name.trim() : '';
    if (!name || name.length < 2 || name.length > 150) {
      throw badRequest('Recipient name is required (2 to 150 characters)');
    }

    let upiId = typeof request.upiId === 'string' ? request.upiId.trim() : null;
    if (upiId && !UPI_ID_REGEX.test(upiId)) {
      throw badRequest('Invalid UPI ID format');
    }

    const existing = await paymentRepository.findRecipientByUserAndNameOrUpi(user.id, name, upiId);
    if (existing) {
      return formatRecipientDto(existing);
    }

    const recipient = await paymentRepository.createRecipient({
      userId: user.id,
      name,
      upiId,
      phone: request.phone ? String(request.phone).trim() : null,
      recipientType: request.recipientType || 'FRIEND',
      isFavorite: Boolean(request.isFavorite),
    });

    return formatRecipientDto(recipient);
  }

  async toggleFavoriteRecipient(user, id) {
    const recipientId = parseInt(id, 10);
    if (!recipientId) throw badRequest('Invalid recipient ID');

    const updated = await paymentRepository.toggleFavoriteRecipient(recipientId, user.id);
    if (!updated) throw notFound('Recipient not found or not owned by you');

    return formatRecipientDto(updated);
  }

  async deleteRecipient(user, id) {
    const recipientId = parseInt(id, 10);
    if (!recipientId) throw badRequest('Invalid recipient ID');

    const success = await paymentRepository.deleteRecipient(recipientId, user.id);
    if (!success) throw notFound('Recipient not found or not owned by you');

    return { success: true, message: 'Recipient deleted successfully' };
  }
}

const paymentServiceInstance = new PaymentService();
paymentServiceInstance.buildUpiPaymentUri = buildUpiPaymentUri;

module.exports = paymentServiceInstance;
module.exports.buildUpiPaymentUri = buildUpiPaymentUri;
