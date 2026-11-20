const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const paymentService = require('../src/services/paymentService');
const paymentRepository = require('../src/repositories/paymentRepository');
const transactionRepository = require('../src/repositories/transactionRepository');
const accountRepository = require('../src/repositories/accountRepository');
const accountService = require('../src/services/accountService');
const categoryService = require('../src/services/categoryService');

// Mock User
const mockUser = {
  id: 101,
  username: 'testuser',
  email: 'testuser@example.com',
  role: 'ROLE_USER',
};

const otherUser = {
  id: 202,
  username: 'attacker',
  email: 'attacker@example.com',
  role: 'ROLE_USER',
};

describe('Pay & Track Service & Validation Suite', () => {
  beforeEach(() => {
    // Mock visible categories and accounts
    categoryService.getAllCategories = async (u) => [
      { id: 1, name: 'Food & Dining', user_id: u.id },
      { id: 2, name: 'Shopping', user_id: u.id },
      { id: 3, name: 'Family & Friends', user_id: u.id },
    ];

    accountService.getAllAccounts = async (u) => [
      { id: 10, name: 'HDFC Bank', balance: 50000.00, user_id: u.id },
      { id: 20, name: 'Cash Wallet', balance: 5000.00, user_id: u.id },
    ];
  });

  // 1. Amount Validation Tests
  describe('1. Amount Validation', () => {
    test('Rejects negative amount', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Rahul Sharma',
          paymentMethod: 'UPI',
          upiId: 'rahul@okhdfcbank',
          amount: -500,
          categoryId: 1,
          accountId: 10,
        }),
        /Amount must be a valid positive number greater than 0/
      );
    });

    test('Rejects zero amount', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Rahul Sharma',
          paymentMethod: 'UPI',
          upiId: 'rahul@okhdfcbank',
          amount: 0,
          categoryId: 1,
          accountId: 10,
        }),
        /Amount must be a valid positive number greater than 0/
      );
    });

    test('Rejects non-numeric amount', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Rahul Sharma',
          paymentMethod: 'UPI',
          upiId: 'rahul@okhdfcbank',
          amount: 'abc',
          categoryId: 1,
          accountId: 10,
        }),
        /Amount must be a valid positive number greater than 0/
      );
    });

    test('Rejects amount exceeding NPCI UPI limit of ₹1,00,000', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Rahul Sharma',
          paymentMethod: 'UPI',
          upiId: 'rahul@okhdfcbank',
          amount: 100000.01,
          categoryId: 1,
          accountId: 10,
        }),
        /Amount exceeds maximum supported UPI transaction limit of ₹1,00,000/
      );
    });

    test('Rejects amount with more than 2 decimal places', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Rahul Sharma',
          paymentMethod: 'UPI',
          upiId: 'rahul@okhdfcbank',
          amount: 250.555,
          categoryId: 1,
          accountId: 10,
        }),
        /Amount cannot have more than 2 decimal places/
      );
    });
  });

  // 2. UPI ID and Payment Method Validation
  describe('2. UPI ID and Payment Method Validation', () => {
    test('Rejects missing UPI ID when payment method is UPI', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Deepak Verma',
          paymentMethod: 'UPI',
          amount: 500,
          categoryId: 1,
          accountId: 10,
        }),
        /Recipient UPI ID is required for UPI payments/
      );
    });

    test('Rejects malformed UPI ID format', async () => {
      const invalidUpiIds = ['not-an-upi', '@bank', 'user@', 'user@@bank', 'u@b'];
      for (const invalidUpi of invalidUpiIds) {
        await assert.rejects(
          () => paymentService.createPayment(mockUser, {
            recipientName: 'Deepak Verma',
            paymentMethod: 'UPI',
            upiId: invalidUpi,
            amount: 500,
            categoryId: 1,
            accountId: 10,
          }),
          /Invalid UPI ID format/
        );
      }
    });

    test('Rejects invalid payment method', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Deepak Verma',
          paymentMethod: 'BITCOIN',
          amount: 500,
          categoryId: 1,
          accountId: 10,
        }),
        /Payment method must be either UPI or CASH/
      );
    });

    test('Rejects empty or too short recipient name', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: ' ',
          paymentMethod: 'UPI',
          upiId: 'user@upi',
          amount: 500,
          categoryId: 1,
          accountId: 10,
        }),
        /Recipient name is required/
      );
    });
  });

  // 3. User Ownership & Security
  describe('3. User Ownership & Authorization', () => {
    test('Derives user ownership from authenticated token, ignoring spoofed userId in body', async () => {
      let capturedUserId = null;
      paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
      paymentRepository.createRecipient = async (data) => ({ id: 55, ...data });
      paymentRepository.createPayment = async (data) => {
        capturedUserId = data.userId;
        return {
          id: 1,
          user_id: data.userId,
          recipient_id: 55,
          recipient_name: data.recipientName,
          upi_id: data.upiId,
          amount: data.amount,
          payment_method: data.paymentMethod,
          status: data.status,
          category_id: data.categoryId,
          account_id: data.accountId,
          transaction_id: null,
          payment_date: data.paymentDate,
          reference_id: data.referenceId,
          created_at: new Date(),
        };
      };

      const result = await paymentService.createPayment(mockUser, {
        userId: 999999, // Attempted spoofed user_id
        recipientName: 'Sister Priya',
        paymentMethod: 'UPI',
        upiId: 'priya@okhdfcbank',
        amount: 2500,
        categoryId: 3,
        accountId: 10,
        recipientType: 'FAMILY',
      });

      assert.equal(capturedUserId, mockUser.id, 'User ID must strictly come from req.user.id');
      assert.equal(result.userId, mockUser.id);
      assert.equal(result.status, 'PENDING');
    });

    test('Access denied when attempting to view another user payment record', async () => {
      paymentRepository.findPaymentById = async (id) => ({
        id: 77,
        user_id: otherUser.id, // Owned by another user
        recipient_name: 'Store Owner',
        amount: 1200,
      });

      await assert.rejects(
        () => paymentService.getPaymentById(mockUser, 77),
        /Access denied/
      );
    });

    test('Access denied when attempting to cancel another user payment record', async () => {
      paymentRepository.findPaymentById = async (id) => ({
        id: 88,
        user_id: otherUser.id,
        status: 'PENDING',
      });

      await assert.rejects(
        () => paymentService.cancelPayment(mockUser, 88),
        /Access denied/
      );
    });
  });

  // 4. UPI Payment Lifecycle (Step 2 behavior)
  describe('4. UPI Payment Lifecycle', () => {
    test('UPI payment attempt is saved as PENDING and does not deduct balance or create duplicate transaction', async () => {
      let createdTransaction = false;
      let balanceUpdated = false;

      transactionRepository.create = async () => {
        createdTransaction = true;
      };
      accountRepository.updateBalance = async () => {
        balanceUpdated = true;
      };

      paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
      paymentRepository.createRecipient = async (data) => ({ id: 60, ...data });
      paymentRepository.createPayment = async (data) => ({
        id: 12,
        user_id: data.userId,
        recipient_id: 60,
        recipient_name: data.recipientName,
        upi_id: data.upiId,
        amount: data.amount,
        payment_method: data.paymentMethod,
        status: data.status,
        category_id: data.categoryId,
        account_id: data.accountId,
        transaction_id: data.transactionId,
        payment_date: data.paymentDate,
        reference_id: data.referenceId,
        created_at: new Date(),
      });

      const payment = await paymentService.createPayment(mockUser, {
        recipientName: 'Kirana General Store',
        paymentMethod: 'UPI',
        upiId: 'kiranastore@upi',
        amount: 450.00,
        categoryId: 1,
        accountId: 10,
        recipientType: 'SHOP',
        notes: 'Groceries and snacks',
      });

      assert.equal(payment.status, 'PENDING');
      assert.equal(payment.transactionId, null);
      assert.equal(createdTransaction, false, 'No transaction row should be created prematurely for PENDING UPI');
      assert.equal(balanceUpdated, false, 'Account balance should not be deducted before UPI launch & confirmation');
      assert.ok(payment.referenceId.startsWith('PAY-'));
    });
  });

  // 5. Cash Payment Lifecycle
  describe('5. Cash Payment Lifecycle', () => {
    test('Confirmed cash payment creates transaction, deducts balance, and sets status CASH_PAID', async () => {
      let transactionParams = null;
      let balanceUpdateParams = null;

      transactionRepository.create = async (params) => {
        transactionParams = params;
        return { id: 901, ...params };
      };

      accountRepository.updateBalance = async (accountId, amount, type) => {
        balanceUpdateParams = { accountId, amount, type };
      };

      paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
      paymentRepository.createRecipient = async (data) => ({ id: 75, ...data });
      paymentRepository.createPayment = async (data) => ({
        id: 33,
        user_id: data.userId,
        recipient_id: 75,
        recipient_name: data.recipientName,
        upi_id: null,
        amount: data.amount,
        payment_method: 'CASH',
        status: data.status,
        category_id: data.categoryId,
        account_id: data.accountId,
        transaction_id: data.transactionId,
        payment_date: data.paymentDate,
        reference_id: data.referenceId,
        created_at: new Date(),
      });

      const payment = await paymentService.createPayment(mockUser, {
        recipientName: 'Ramesh Electrician',
        paymentMethod: 'CASH',
        amount: 800.00,
        categoryId: 2,
        accountId: 20, // Cash wallet with ₹5000
        recipientType: 'MERCHANT',
        isCashHandedOver: true,
        notes: 'Fan repair work',
      });

      assert.equal(payment.status, 'CASH_PAID');
      assert.equal(payment.transactionId, 901);
      assert.ok(transactionParams, 'Transaction must be created for confirmed cash');
      assert.equal(transactionParams.amount, 800.00);
      assert.equal(transactionParams.type, 'EXPENSE');
      assert.equal(balanceUpdateParams.accountId, 20);
      assert.equal(balanceUpdateParams.amount, 800.00);
      assert.equal(balanceUpdateParams.type, 'EXPENSE');
    });

    test('Unconfirmed cash payment is saved as PENDING without creating transaction row', async () => {
      let transactionCreated = false;
      transactionRepository.create = async () => { transactionCreated = true; };

      paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
      paymentRepository.createRecipient = async (data) => ({ id: 76, ...data });
      paymentRepository.createPayment = async (data) => ({
        id: 34,
        user_id: data.userId,
        recipient_id: 76,
        recipient_name: data.recipientName,
        amount: data.amount,
        payment_method: 'CASH',
        status: data.status,
        category_id: data.categoryId,
        account_id: data.accountId,
        transaction_id: null,
        payment_date: data.paymentDate,
        reference_id: data.referenceId,
      });

      const payment = await paymentService.createPayment(mockUser, {
        recipientName: 'Uncle Bob',
        paymentMethod: 'CASH',
        amount: 500.00,
        categoryId: 3,
        accountId: 20,
        isCashHandedOver: false, // Not handed over yet
      });

      assert.equal(payment.status, 'PENDING');
      assert.equal(payment.transactionId, null);
      assert.equal(transactionCreated, false);
    });

    test('Rejects confirmed cash payment if account has insufficient balance', async () => {
      await assert.rejects(
        () => paymentService.createPayment(mockUser, {
          recipientName: 'Merchant Shop',
          paymentMethod: 'CASH',
          amount: 6000.00, // Account balance is only ₹5000
          categoryId: 2,
          accountId: 20,
          isCashHandedOver: true,
        }),
        /Insufficient balance/
      );
    });
  });

  // 6. UPI URI Generation & Encoding (Step 3)
  describe('6. UPI URI Generation & Encoding', () => {
    test('Builds properly formatted and URL-encoded upi://pay URI', () => {
      const uri = paymentService.buildUpiPaymentUri({
        upiId: 'merchant.store@okhdfcbank',
        recipientName: 'Sharma & Sons General Store',
        amount: 1450.50,
        note: 'Invoice #102 & Items',
        referenceId: 'UPI-TXN-12345678',
      });

      assert.ok(uri.startsWith('upi://pay?'), 'URI must use upi://pay scheme');
      assert.ok(uri.includes('pa=merchant.store%40okhdfcbank'), 'UPI ID must be URL-encoded');
      assert.ok(uri.includes('pn=Sharma%20%26%20Sons%20General%20Store'), 'Payee Name must be URL-encoded');
      assert.ok(uri.includes('am=1450.50'), 'Amount must be formatted to 2 decimals');
      assert.ok(uri.includes('cu=INR'), 'Currency must be INR');
      assert.ok(uri.includes('tn=Invoice%20%23102%20%26%20Items'), 'Transaction note must be URL-encoded');
      assert.ok(uri.includes('tr=UPI-TXN-12345678'), 'Reference ID must be included');
    });

    test('Truncates transaction note to 50 characters to comply with standard NPCI specs', () => {
      const longNote = 'A'.repeat(80);
      const uri = paymentService.buildUpiPaymentUri({
        upiId: 'friend@upi',
        recipientName: 'Friend',
        amount: 200,
        note: longNote,
      });

      const parsedUrl = new URL(uri.replace('upi://pay', 'https://dummy.com'));
      const tn = parsedUrl.searchParams.get('tn');
      assert.equal(tn.length, 50, 'Note parameter must not exceed 50 characters for UPI app compatibility');
    });

    test('Rejects invalid parameters in URI generator', () => {
      assert.throws(
        () => paymentService.buildUpiPaymentUri({ upiId: 'invalid-vpa', recipientName: 'Shop', amount: 100 }),
        /Invalid or missing recipient UPI ID/
      );
      assert.throws(
        () => paymentService.buildUpiPaymentUri({ upiId: 'valid@upi', recipientName: '', amount: 100 }),
        /Recipient name is required/
      );
      assert.throws(
        () => paymentService.buildUpiPaymentUri({ upiId: 'valid@upi', recipientName: 'Shop', amount: 0 }),
        /Amount must be positive/
      );
    });
  });

  // 7. UPI Payment Initiation & Idempotency
  describe('7. UPI Payment Initiation & Idempotency', () => {
    test('initiateUpiPayment creates PENDING payment, logs attempt, and returns upiUri', async () => {
      let loggedAttempt = null;
      paymentRepository.findPaymentByIdempotencyKey = async () => null;
      paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
      paymentRepository.createRecipient = async (data) => ({ id: 80, ...data });
      paymentRepository.createPayment = async (data) => ({
        id: 105,
        user_id: data.userId,
        recipient_id: 80,
        recipient_name: data.recipientName,
        upi_id: data.upiId,
        amount: data.amount,
        payment_method: 'UPI',
        status: 'PENDING',
        category_id: data.categoryId,
        account_id: data.accountId,
        transaction_id: null,
        payment_date: data.paymentDate,
        reference_id: data.referenceId,
        idempotency_key: data.idempotencyKey,
        attempt_count: 1,
        created_at: new Date(),
      });
      paymentRepository.createPaymentAttemptLog = async (data) => {
        loggedAttempt = data;
      };

      const result = await paymentService.initiateUpiPayment(mockUser, {
        recipientName: 'Apex Medicals',
        upiId: 'apexmedicals@paytm',
        amount: 320.00,
        categoryId: 1,
        accountId: 10,
        platform: 'android',
        idempotencyKey: 'IDEMP-KEY-999',
      });

      assert.equal(result.payment.status, 'PENDING');
      assert.equal(result.payment.attemptCount, 1);
      assert.ok(result.upiUri.startsWith('upi://pay?'));
      assert.ok(result.referenceId.startsWith('UPI-TXN-'));
      assert.equal(result.isDuplicate, false);
      assert.ok(loggedAttempt, 'Payment attempt log must be recorded');
      assert.equal(loggedAttempt.platform, 'android');
      assert.equal(loggedAttempt.attemptNumber, 1);
    });

    test('initiateUpiPayment returns existing payment if idempotency key matches', async () => {
      const existingPayment = {
        id: 106,
        user_id: mockUser.id,
        recipient_id: 80,
        recipient_name: 'Apex Medicals',
        upi_id: 'apexmedicals@paytm',
        amount: 320.00,
        payment_method: 'UPI',
        status: 'PENDING',
        category_id: 1,
        account_id: 10,
        transaction_id: null,
        payment_date: '2026-11-21',
        reference_id: 'UPI-TXN-ALREADY-EXISTS',
        idempotency_key: 'IDEMP-KEY-DUPLICATE',
        attempt_count: 1,
        created_at: new Date(),
      };

      paymentRepository.findPaymentByIdempotencyKey = async (userId, key) => {
        if (userId === mockUser.id && key === 'IDEMP-KEY-DUPLICATE') return existingPayment;
        return null;
      };

      const result = await paymentService.initiateUpiPayment(mockUser, {
        recipientName: 'Apex Medicals',
        upiId: 'apexmedicals@paytm',
        amount: 320.00,
        categoryId: 1,
        accountId: 10,
        idempotencyKey: 'IDEMP-KEY-DUPLICATE',
      });

      assert.equal(result.isDuplicate, true);
      assert.equal(result.referenceId, 'UPI-TXN-ALREADY-EXISTS');
      assert.equal(result.payment.id, 106);
    });
  });

  // 8. Status Transitions & Double Debit Prevention
  describe('8. Status Transitions & Double Debit Prevention', () => {
    test('Transitions from PENDING to UNVERIFIED without creating expense row', async () => {
      let transactionCreated = false;
      transactionRepository.create = async () => { transactionCreated = true; };

      const currentPayment = {
        id: 201,
        user_id: mockUser.id,
        recipient_name: 'Store',
        amount: 500,
        status: 'PENDING',
        transaction_id: null,
      };

      paymentRepository.findPaymentById = async () => currentPayment;
      paymentRepository.updatePaymentStatus = async (id, status) => ({
        ...currentPayment,
        status,
      });

      const updated = await paymentService.updatePaymentStatus(mockUser, 201, { status: 'UNVERIFIED' });
      assert.equal(updated.status, 'UNVERIFIED');
      assert.equal(transactionCreated, false, 'No transaction should be created for unverified status');
    });

    test('Transitions from UNVERIFIED to SUCCESS upon explicit user confirmation, creating expense and updating balance once', async () => {
      let createdTransactionsCount = 0;
      let balanceDeductionsCount = 0;

      const currentPayment = {
        id: 202,
        user_id: mockUser.id,
        recipient_name: 'Store XYZ',
        upi_id: 'store@upi',
        amount: 750.00,
        status: 'UNVERIFIED',
        category_id: 1,
        account_id: 10,
        transaction_id: null,
        payment_date: '2026-11-21',
        reference_id: 'UPI-TXN-ABC',
        notes: 'Supplies',
      };

      paymentRepository.findPaymentById = async () => currentPayment;
      accountRepository.findById = async () => ({ id: 10, name: 'Bank', balance: 50000 });
      transactionRepository.create = async () => {
        createdTransactionsCount++;
        return { id: 888 };
      };
      accountRepository.updateBalance = async () => {
        balanceDeductionsCount++;
      };
      paymentRepository.updatePaymentStatus = async (id, status, txnId) => ({
        ...currentPayment,
        status,
        transaction_id: txnId,
      });

      const confirmed = await paymentService.updatePaymentStatus(mockUser, 202, {
        status: 'SUCCESS',
        confirmationNotes: 'Debited from HDFC',
      });

      assert.equal(confirmed.status, 'SUCCESS');
      assert.equal(confirmed.transactionId, 888);
      assert.equal(createdTransactionsCount, 1);
      assert.equal(balanceDeductionsCount, 1);

      // Verify idempotency: calling SUCCESS again when transaction_id already exists does not re-debit
      currentPayment.transaction_id = 888;
      currentPayment.status = 'SUCCESS';
      await paymentService.updatePaymentStatus(mockUser, 202, { status: 'SUCCESS' });
      assert.equal(createdTransactionsCount, 1, 'Duplicate transaction must never be created');
      assert.equal(balanceDeductionsCount, 1, 'Account balance must never be debited twice');
    });
  });

  // 9. Retry Behavior
  describe('9. Retry Behavior & Safety', () => {
    test('Retrying payment reuses existing record, increments attemptCount, and does not duplicate', async () => {
      let loggedAttempt = null;
      const currentPayment = {
        id: 301,
        user_id: mockUser.id,
        recipient_name: 'Cafeteria',
        upi_id: 'cafe@upi',
        amount: 150.00,
        status: 'FAILED',
        attempt_count: 1,
        notes: 'Coffee',
      };

      paymentRepository.findPaymentById = async () => currentPayment;
      paymentRepository.updatePaymentAttempt = async (id, data) => ({
        ...currentPayment,
        attempt_count: data.attemptCount,
        reference_id: data.referenceId,
        status: data.status,
      });
      paymentRepository.createPaymentAttemptLog = async (data) => {
        loggedAttempt = data;
      };

      const retryResult = await paymentService.retryPayment(mockUser, 301, { platform: 'ios' });

      assert.equal(retryResult.payment.id, 301, 'Must reuse the existing payment record');
      assert.equal(retryResult.payment.attemptCount, 2, 'Attempt count must increment');
      assert.equal(retryResult.payment.status, 'PENDING');
      assert.ok(retryResult.upiUri.startsWith('upi://pay?'));
      assert.equal(loggedAttempt.attemptNumber, 2);
      assert.equal(loggedAttempt.platform, 'ios');
    });

    test('Rejects retrying already completed payment', async () => {
      paymentRepository.findPaymentById = async () => ({
        id: 302,
        user_id: mockUser.id,
        status: 'SUCCESS',
      });

      await assert.rejects(
        () => paymentService.retryPayment(mockUser, 302),
        /This payment has already been completed and cannot be retried/
      );
    });

    test('Rejects retrying another user payment (IDOR protection)', async () => {
      paymentRepository.findPaymentById = async () => ({
        id: 303,
        user_id: mockUser.id, // owned by mockUser (101)
        status: 'FAILED',
      });

      await assert.rejects(
        () => paymentService.retryPayment(otherUser, 303),
        /Access denied: You cannot retry another user payment/
      );
    });
  });

  // 10. Step 5: History Filtering & Analytics Double-Counting Protection
  describe('10. Payment History Filtering & Analytics Protection', () => {
    test('getPayments forwards multi-dimensional query filters to repository', async () => {
      let passedFilters = null;
      let passedSize = null;
      let passedOffset = null;

      paymentRepository.findPaymentsByUser = async (userId, filters, size, offset) => {
        passedFilters = filters;
        passedSize = size;
        passedOffset = offset;
        return [];
      };
      paymentRepository.countPaymentsByUser = async () => 0;

      await paymentService.getPayments(mockUser, {
        status: 'PENDING',
        paymentMethod: 'UPI',
        startDate: '2026-11-01',
        endDate: '2026-11-21',
        search: 'Rahul',
        categoryId: '2',
        minAmount: '100',
        maxAmount: '5000',
        page: '1',
        size: '10',
      });

      assert.equal(passedFilters.status, 'PENDING');
      assert.equal(passedFilters.paymentMethod, 'UPI');
      assert.equal(passedFilters.startDate, '2026-11-01');
      assert.equal(passedFilters.endDate, '2026-11-21');
      assert.equal(passedFilters.search, 'Rahul');
      assert.equal(passedFilters.categoryId, 2);
      assert.equal(passedFilters.minAmount, 100);
      assert.equal(passedFilters.maxAmount, 5000);
      assert.equal(passedSize, 10);
      assert.equal(passedOffset, 10);
    });

    test('Analytics double-counting prevention: 3 payment attempts on a single expense creates exactly 1 transaction in ledger', async () => {
      let createdTransactions = [];
      let accountDeductions = [];
      let attemptLogs = [];

      // 1. Initial UPI Payment (Attempt 1)
      const parentPayment = {
        id: 501,
        user_id: mockUser.id,
        recipient_id: 80,
        recipient_name: 'Kirana Store',
        upi_id: 'kirana@upi',
        amount: 850.00,
        payment_method: 'UPI',
        status: 'PENDING',
        category_id: 1,
        account_id: 10,
        transaction_id: null,
        payment_date: '2026-11-21',
        reference_id: 'UPI-TXN-ATTEMPT-1',
        attempt_count: 1,
        notes: 'Monthly groceries',
      };

      paymentRepository.findPaymentById = async () => parentPayment;
      accountRepository.findById = async () => ({ id: 10, name: 'HDFC Bank', balance: 50000 });
      paymentRepository.updatePaymentAttempt = async (id, data) => {
        parentPayment.attempt_count = data.attemptCount;
        parentPayment.reference_id = data.referenceId;
        parentPayment.status = data.status;
        return parentPayment;
      };
      paymentRepository.createPaymentAttemptLog = async (data) => {
        attemptLogs.push(data);
      };
      transactionRepository.create = async (txn) => {
        createdTransactions.push(txn);
        return { id: 9001 + createdTransactions.length };
      };
      accountRepository.updateBalance = async (accId, amt, type) => {
        accountDeductions.push({ accId, amt, type });
      };
      paymentRepository.updatePaymentStatus = async (id, status, txnId) => {
        parentPayment.status = status;
        if (txnId) parentPayment.transaction_id = txnId;
        return parentPayment;
      };

      // User retries payment (Attempt 2)
      await paymentService.retryPayment(mockUser, 501, { platform: 'android' });
      assert.equal(parentPayment.attempt_count, 2);
      assert.equal(parentPayment.id, 501, 'Parent payment ID must remain unchanged');
      assert.equal(createdTransactions.length, 0, 'No transaction should be created yet for attempt 2');

      // User retries payment again (Attempt 3)
      await paymentService.retryPayment(mockUser, 501, { platform: 'android' });
      assert.equal(parentPayment.attempt_count, 3);
      assert.equal(parentPayment.id, 501, 'Parent payment ID must remain unchanged');
      assert.equal(createdTransactions.length, 0, 'No transaction should be created yet for attempt 3');

      // User finally confirms payment as SUCCESS
      const finalized = await paymentService.updatePaymentStatus(mockUser, 501, {
        status: 'SUCCESS',
        confirmationNotes: 'UPI Ref 432198765432',
      });

      assert.equal(finalized.status, 'SUCCESS');
      assert.equal(finalized.transactionId, 9002);

      // Verify that after 3 attempts, EXACTLY ONE expense transaction was created in transactions table
      assert.equal(createdTransactions.length, 1, 'Single expense with three payment attempts must count as one expense, not three');
      assert.equal(createdTransactions[0].amount, 850.00);
      assert.equal(createdTransactions[0].type, 'EXPENSE');

      // Verify that account balance was only deducted once
      assert.equal(accountDeductions.length, 1, 'Account balance must be deducted exactly once');
      assert.equal(accountDeductions[0].amt, 850.00);

      // Verify idempotency: calling updatePaymentStatus again does not re-add to transactions
      await paymentService.updatePaymentStatus(mockUser, 501, { status: 'SUCCESS' });
      assert.equal(createdTransactions.length, 1, 'Subsequent status updates must not double-count expenses');
      assert.equal(accountDeductions.length, 1, 'Account balance must not be deducted again');
    });

    test('getPaymentAttempts requires ownership or owner role', async () => {
      paymentRepository.findPaymentById = async () => ({
        id: 601,
        user_id: mockUser.id,
      });

      await assert.rejects(
        () => paymentService.getPaymentAttempts(otherUser, 601),
        /Access denied/
      );
    });
  });
});
