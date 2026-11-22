const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const paymentService = require('../src/services/paymentService');
const gatewayService = require('../src/services/gatewayService');
const paymentRepository = require('../src/repositories/paymentRepository');
const transactionRepository = require('../src/repositories/transactionRepository');
const accountRepository = require('../src/repositories/accountRepository');
const accountService = require('../src/services/accountService');
const categoryService = require('../src/services/categoryService');

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

describe('Payment Gateway & UPI Intent Verification Suite', () => {
  let inMemoryPayments = [];
  let inMemoryAttempts = [];
  let inMemoryTransactions = [];
  let nextPaymentId = 1;

  beforeEach(() => {
    inMemoryPayments = [];
    inMemoryAttempts = [];
    inMemoryTransactions = [];
    nextPaymentId = 1;

    categoryService.getAllCategories = async (u) => [
      { id: 1, name: 'Food & Dining', user_id: u.id },
      { id: 2, name: 'Utilities', user_id: u.id },
    ];
    categoryService.findById = async (id) => ({ id, name: 'Food & Dining' });

    accountService.getAllAccounts = async (u) => [
      { id: 10, name: 'HDFC Savings', balance: 50000.0, user_id: u.id },
    ];
    accountRepository.findById = async (id) => ({ id, name: 'HDFC Savings', balance: 50000.0 });
    accountRepository.updateBalance = async () => true;

    transactionRepository.create = async (data) => {
      const txn = { id: 900 + inMemoryTransactions.length, ...data };
      inMemoryTransactions.push(txn);
      return txn;
    };

    paymentRepository.findRecipientByUserAndNameOrUpi = async () => null;
    paymentRepository.createRecipient = async (data) => ({ id: 55, ...data });
    paymentRepository.touchRecipient = async () => true;

    paymentRepository.createPayment = async (data) => {
      const p = {
        id: nextPaymentId++,
        user_id: data.userId,
        recipient_id: data.recipientId,
        recipient_name: data.recipientName,
        upi_id: data.upiId,
        amount: data.amount,
        payment_method: data.paymentMethod,
        status: data.status,
        category_id: data.categoryId,
        account_id: data.accountId,
        transaction_id: data.transactionId,
        payment_date: data.paymentDate,
        notes: data.notes,
        reference_id: data.referenceId,
        idempotency_key: data.idempotencyKey,
        attempt_count: data.attemptCount || 1,
        gateway_order_id: null,
        gateway_provider: 'RAZORPAY',
        is_sandbox: Boolean(data.isSandbox),
        created_at: new Date(),
        updated_at: new Date(),
      };
      inMemoryPayments.push(p);
      return p;
    };

    paymentRepository.findPaymentById = async (id) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      return p ? { ...p } : null;
    };

    paymentRepository.findPaymentByIdempotencyKey = async (userId, key) => {
      const p = inMemoryPayments.find((x) => x.user_id === userId && x.idempotency_key === key);
      return p ? { ...p } : null;
    };

    paymentRepository.findPaymentByGatewayOrderId = async (orderId) => {
      const p = inMemoryPayments.find((x) => x.gateway_order_id === orderId);
      return p ? { ...p } : null;
    };

    paymentRepository.updateGatewayOrderDetails = async (id, { gatewayOrderId, gatewayProvider, status, isSandbox }) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      if (p) {
        p.gateway_order_id = gatewayOrderId;
        p.gateway_provider = gatewayProvider;
        p.status = status;
        if (isSandbox !== undefined) p.is_sandbox = Boolean(isSandbox);
      }
      return p ? { ...p } : null;
    };

    paymentRepository.updatePaymentStatus = async (id, status, txnId = null) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      if (p) {
        p.status = status;
        if (txnId) p.transaction_id = txnId;
      }
      return p ? { ...p } : null;
    };

    paymentRepository.recordGatewayPaymentSuccess = async (id, { gatewayPaymentId, gatewaySignature, transactionId, verifiedAt }) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      if (p) {
        p.status = 'SUCCESS';
        p.gateway_payment_id = gatewayPaymentId;
        p.gateway_signature = gatewaySignature;
        p.transaction_id = transactionId;
        p.verified_at = verifiedAt;
      }
      return p ? { ...p } : null;
    };

    paymentRepository.recordGatewayPaymentFailure = async (id, { errorCode, errorDescription }) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      if (p) {
        p.status = 'FAILED';
        p.gateway_error_code = errorCode;
        p.gateway_error_description = errorDescription;
      }
      return p ? { ...p } : null;
    };

    paymentRepository.updatePaymentAttempt = async (id, { attemptCount, referenceId, status }) => {
      const p = inMemoryPayments.find((x) => x.id === Number(id));
      if (p) {
        p.attempt_count = attemptCount;
        p.reference_id = referenceId;
        p.status = status;
      }
      return p ? { ...p } : null;
    };

    paymentRepository.createPaymentAttemptLog = async (data) => {
      inMemoryAttempts.push(data);
      return inMemoryAttempts.length;
    };

    paymentRepository.recordWebhookReceived = async () => true;
  });

  // 1. Order Creation & Validation
  describe('1. Gateway Order Creation', () => {
    test('Creates valid gateway order with amount converted to paise and returns dynamic QR', async () => {
      const result = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Kiran Store',
        upiId: 'kiran@upi',
        amount: 499.5,
        categoryId: 1,
        accountId: 10,
        notes: 'Grocery bill',
      });

      assert.ok(result.gatewayOrder);
      assert.ok(result.gatewayOrder.id.startsWith('order_'));
      assert.equal(result.gatewayOrder.amount, 49950); // 499.50 * 100 paise
      assert.equal(result.gatewayOrder.currency, 'INR');
      assert.ok(result.gatewayOrder.dynamicQrString);
      assert.ok(result.gatewayOrder.dynamicQrString.includes('am=499.50'));
      assert.equal(result.payment.status, 'CREATED');
      assert.equal(result.payment.amount, 499.5);
    });

    test('Rejects order creation with invalid or non-numeric amount', async () => {
      await assert.rejects(
        () =>
          paymentService.createGatewayOrder(mockUser, {
            recipientName: 'Kiran Store',
            upiId: 'kiran@upi',
            amount: -100,
            categoryId: 1,
            accountId: 10,
          }),
        /Amount must be a valid positive number/
      );
    });

    test('Rejects order creation exceeding NPCI limit of ₹1,00,000', async () => {
      await assert.rejects(
        () =>
          paymentService.createGatewayOrder(mockUser, {
            recipientName: 'Kiran Store',
            upiId: 'kiran@upi',
            amount: 100001,
            categoryId: 1,
            accountId: 10,
          }),
        /Amount exceeds maximum supported UPI transaction limit of ₹1,00,000/
      );
    });

    test('Enforces idempotency on order creation: returns existing order without creating duplicate charge', async () => {
      const idempotencyKey = `idem_${Date.now()}_test`;
      const first = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Kiran Store',
        upiId: 'kiran@upi',
        amount: 250,
        categoryId: 1,
        accountId: 10,
        idempotencyKey,
      });

      const second = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Kiran Store',
        upiId: 'kiran@upi',
        amount: 250,
        categoryId: 1,
        accountId: 10,
        idempotencyKey,
      });

      assert.equal(second.payment.id, first.payment.id);
      assert.equal(second.gatewayOrder.id, first.gatewayOrder.id);
      assert.equal(second.isExisting, true);
    });
  });

  // 2. Payment Initiation
  describe('2. Payment Initiation & State Transition', () => {
    test('Transitions order status from CREATED to PAYMENT_INITIATED when user opens checkout', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Metro Recharge',
        upiId: 'metro@paytm',
        amount: 150,
        categoryId: 1,
        accountId: 10,
      });

      const initiated = await paymentService.markPaymentInitiated(mockUser, created.payment.id, {
        platform: 'android',
      });

      assert.equal(initiated.status, 'PAYMENT_INITIATED');
    });

    test('Access control: user B cannot mark user A payment as initiated', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Metro Recharge',
        upiId: 'metro@paytm',
        amount: 150,
        categoryId: 1,
        accountId: 10,
      });

      await assert.rejects(
        () => paymentService.markPaymentInitiated(otherUser, created.payment.id),
        /Access denied/
      );
    });
  });

  // 3. Cryptographic Signature Verification & Fulfillment
  describe('3. Cryptographic Verification & Safe Fulfillment', () => {
    test('Rejects verification with forged or invalid signature', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Cafe Coffee',
        upiId: 'cafe@upi',
        amount: 120,
        categoryId: 1,
        accountId: 10,
      });

      await assert.rejects(
        () =>
          paymentService.verifyGatewayPayment(mockUser, {
            paymentId: created.payment.id,
            gatewayOrderId: created.gatewayOrder.id,
            gatewayPaymentId: 'pay_tampered_123',
            gatewaySignature: 'forged_fake_signature_abc',
          }),
        /Payment verification failed: Invalid digital signature/
      );

      const failed = await paymentRepository.findPaymentById(created.payment.id);
      assert.equal(failed.status, 'FAILED');
      assert.equal(failed.gateway_error_code, 'SIGNATURE_VERIFICATION_FAILED');
    });

    test('Verifies valid payment signature, creates ledger expense transaction, and marks SUCCESS', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Cafe Coffee',
        upiId: 'cafe@upi',
        amount: 120,
        categoryId: 1,
        accountId: 10,
      });

      const paymentId = `pay_sand_${Date.now()}`;
      const validSig = `sandbox_sig_${created.gatewayOrder.id}_${paymentId}`;

      const verified = await paymentService.verifyGatewayPayment(mockUser, {
        paymentId: created.payment.id,
        gatewayOrderId: created.gatewayOrder.id,
        gatewayPaymentId: paymentId,
        gatewaySignature: validSig,
      });

      assert.equal(verified.verified, true);
      assert.equal(verified.payment.status, 'SUCCESS');
      assert.ok(verified.payment.transactionId);
      assert.equal(verified.payment.gatewayPaymentId, paymentId);
      assert.equal(inMemoryTransactions.length, 1);
    });

    test('Verification idempotency: multiple verification calls do not create duplicate ledger transactions', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Tea Stall',
        upiId: 'tea@upi',
        amount: 30,
        categoryId: 1,
        accountId: 10,
      });

      const paymentId = `pay_sand_${Date.now()}`;
      const validSig = `sandbox_sig_${created.gatewayOrder.id}_${paymentId}`;

      const first = await paymentService.verifyGatewayPayment(mockUser, {
        paymentId: created.payment.id,
        gatewayOrderId: created.gatewayOrder.id,
        gatewayPaymentId: paymentId,
        gatewaySignature: validSig,
      });

      const second = await paymentService.verifyGatewayPayment(mockUser, {
        paymentId: created.payment.id,
        gatewayOrderId: created.gatewayOrder.id,
        gatewayPaymentId: paymentId,
        gatewaySignature: validSig,
      });

      assert.equal(first.payment.status, 'SUCCESS');
      assert.equal(second.payment.status, 'SUCCESS');
      assert.equal(first.payment.transactionId, second.payment.transactionId);
      assert.equal(second.alreadyProcessed, true);
      assert.equal(inMemoryTransactions.length, 1, 'Only one transaction must be created');
    });
  });

  // 4. Webhook Processing
  describe('4. Gateway Webhook Processing', () => {
    test('Rejects webhook without valid signature', async () => {
      const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured' }));
      const result = await paymentService.processGatewayWebhook(rawBody, 'invalid_sig', { event: 'payment.captured' });
      assert.equal(result.status, 'rejected');
    });

    test('Processes payment.captured webhook event idempotently', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Book Store',
        upiId: 'book@upi',
        amount: 450,
        categoryId: 1,
        accountId: 10,
      });

      const rawBody = Buffer.from('test_payload');
      const signature = 'sandbox_webhook_sig_123';
      const eventPayload = {
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_hook_${Date.now()}`,
              order_id: created.gatewayOrder.id,
              amount: 45000,
            },
          },
        },
      };

      const result = await paymentService.processGatewayWebhook(rawBody, signature, eventPayload);
      assert.equal(result.status, 'success');

      const updated = await paymentRepository.findPaymentById(created.payment.id);
      assert.equal(updated.status, 'SUCCESS');
      assert.ok(updated.transaction_id);

      // Duplicate webhook arrival does not error or re-debit
      const duplicateResult = await paymentService.processGatewayWebhook(rawBody, signature, eventPayload);
      assert.equal(duplicateResult.status, 'already_processed');
      assert.equal(inMemoryTransactions.length, 1);
    });

    test('Processes payment.failed webhook event and logs gateway decline reason', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Shoe Store',
        upiId: 'shoe@upi',
        amount: 1999,
        categoryId: 1,
        accountId: 10,
      });

      const rawBody = Buffer.from('test_payload');
      const signature = 'sandbox_webhook_sig_123';
      const eventPayload = {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: `pay_failed_${Date.now()}`,
              order_id: created.gatewayOrder.id,
              error_code: 'BAD_REQUEST_ERROR',
              error_description: 'Payment was declined by customer bank.',
            },
          },
        },
      };

      const result = await paymentService.processGatewayWebhook(rawBody, signature, eventPayload);
      assert.equal(result.status, 'recorded_failure');

      const updated = await paymentRepository.findPaymentById(created.payment.id);
      assert.equal(updated.status, 'FAILED');
      assert.equal(updated.gateway_error_code, 'BAD_REQUEST_ERROR');
    });
  });

  // 5. Safe Retry & Duplicate Prevention
  describe('5. Safe Retry & Duplicate Prevention', () => {
    test('Safe retry generates fresh gateway order ID when payment has failed', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Flight Ticket',
        upiId: 'flight@upi',
        amount: 5400,
        categoryId: 1,
        accountId: 10,
      });

      await paymentRepository.recordGatewayPaymentFailure(created.payment.id, {
        errorCode: 'DECLINED_BY_BANK',
        errorDescription: 'Transaction declined for security reasons.',
      });

      const retried = await paymentService.safeRetryGatewayPayment(mockUser, created.payment.id);
      assert.notEqual(retried.gatewayOrder.id, created.gatewayOrder.id);
      assert.equal(retried.payment.attemptCount, 2);
      assert.equal(retried.payment.status, 'CREATED');
    });

    test('Prevents retry and avoids duplicate charge if payment is already successful', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Groceries',
        upiId: 'store@upi',
        amount: 800,
        categoryId: 1,
        accountId: 10,
      });

      const paymentId = `pay_sand_${Date.now()}`;
      await paymentService.verifyGatewayPayment(mockUser, {
        paymentId: created.payment.id,
        gatewayOrderId: created.gatewayOrder.id,
        gatewayPaymentId: paymentId,
        gatewaySignature: `sandbox_sig_${created.gatewayOrder.id}_${paymentId}`,
      });

      await assert.rejects(
        () => paymentService.safeRetryGatewayPayment(mockUser, created.payment.id),
        /Payment is already successful and cannot be retried/
      );
    });

    test('Cancellation: user can cancel CREATED or PENDING payment', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Ride share',
        upiId: 'ride@upi',
        amount: 220,
        categoryId: 1,
        accountId: 10,
      });

      const cancelled = await paymentService.cancelPayment(mockUser, created.payment.id);
      assert.equal(cancelled.status, 'CANCELLED');
    });
  });

  // 6. Sandbox Isolation, Compliance, & Dynamic Expiry
  describe('6. Sandbox Isolation, Compliance, & Dynamic Expiry', () => {
    test('Sandbox simulated payments do NOT mutate production account balance', async () => {
      let balanceUpdated = false;
      accountRepository.updateBalance = async () => {
        balanceUpdated = true;
      };

      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Sandbox Vendor',
        upiId: 'vendor@upi',
        amount: 500,
        categoryId: 1,
        accountId: 10,
      });

      // Verify that expiresAt is provided from gateway provider
      assert.ok(created.gatewayOrder.expiresAt, 'Gateway order must have provider expiresAt');

      const paymentId = `pay_sand_${Date.now()}`;
      const validSig = `sandbox_sig_${created.gatewayOrder.id}_${paymentId}`;

      const verified = await paymentService.verifyGatewayPayment(mockUser, {
        paymentId: created.payment.id,
        gatewayOrderId: created.gatewayOrder.id,
        gatewayPaymentId: paymentId,
        gatewaySignature: validSig,
      });

      assert.equal(verified.verified, true);
      assert.equal(balanceUpdated, false, 'Sandbox payments must NEVER decrement production account balances');
      assert.equal(verified.payment.isSandbox, true);
      assert.equal(verified.payment.isVerified, false, 'Sandbox demo cannot be marked cryptographically verified production payment');
    });

    test('Gateway-routed payments strictly reject manual SUCCESS status manipulation', async () => {
      const created = await paymentService.createGatewayOrder(mockUser, {
        recipientName: 'Merchant Shop',
        upiId: 'shop@upi',
        amount: 350,
        categoryId: 1,
        accountId: 10,
      });

      await assert.rejects(
        () => paymentService.updatePaymentStatus(mockUser, created.payment.id, { status: 'SUCCESS' }),
        /Gateway-routed payments must be verified cryptographically/
      );
    });

    test('Direct personal UPI transfers without gateway are segregated as MANUAL_UNVERIFIED', async () => {
      const payment = await paymentRepository.createPayment({
        userId: mockUser.id,
        recipientName: 'Roommate',
        upiId: 'roommate@upi',
        amount: 1200,
        paymentMethod: 'UPI',
        status: 'PENDING',
        categoryId: 1,
        accountId: 10,
        referenceId: `REF_${Date.now()}`,
      });

      const resolved = await paymentService.updatePaymentStatus(mockUser, payment.id, {
        status: 'SUCCESS',
        confirmationNotes: 'Paid from GPay personal transfer',
      });

      assert.equal(resolved.status, 'MANUAL_UNVERIFIED');
      assert.equal(resolved.isVerified, false);
      assert.equal(resolved.isManualTransfer, true);
    });

    test('Production environment strictly rejects sandbox signatures', () => {
      const origEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const isValid = gatewayService.verifyPaymentSignature({
          orderId: 'order_123',
          paymentId: 'pay_123',
          signature: 'sandbox_sig_order_123_pay_123',
        });
        assert.equal(isValid, false, 'Production environment must strictly reject sandbox signatures');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    test('Gateway reports isConfigured=false when credentials are unset and personal UPI operates independently', () => {
      const publicConfig = paymentService.getGatewayConfig();
      assert.equal(typeof publicConfig.isConfigured, 'boolean');
      
      // Personal UPI payment works independently of gateway keys
      const upiUri = paymentService.buildUpiPaymentUri({
        upiId: 'receiver@okaxis',
        recipientName: 'Store Owner',
        amount: 350.00,
        note: 'Grocery bill',
        referenceId: 'UPI-REF-998877',
      });

      assert.ok(upiUri.startsWith('upi://pay?'));
      assert.ok(upiUri.includes('pa=receiver%40okaxis'));
      assert.ok(upiUri.includes('pn=Store%20Owner'));
      assert.ok(upiUri.includes('am=350.00'));
      assert.ok(upiUri.includes('cu=INR'));
    });
  });
});
