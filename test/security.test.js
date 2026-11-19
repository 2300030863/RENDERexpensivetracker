const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

// Import services and middlewares
const {
  securityHeaders,
  corsProtection,
  authLimiter,
  otpLimiter,
  authKeyGenerator,
  otpKeyGenerator,
  allowedOrigins,
} = require('../src/middleware/security');
const errorHandler = require('../src/middleware/errorHandler');
const { authenticate } = require('../src/middleware/auth');
const { generateToken, verifyToken } = require('../src/utils/jwt');
const transactionService = require('../src/services/transactionService');
const accountService = require('../src/services/accountService');
const budgetService = require('../src/services/budgetService');
const recurringTransactionService = require('../src/services/recurringTransactionService');

// Repositories for mocking
const transactionRepository = require('../src/repositories/transactionRepository');
const userRepository = require('../src/repositories/userRepository');
const accountRepository = require('../src/repositories/accountRepository');
const budgetRepository = require('../src/repositories/budgetRepository');
const categoryRepository = require('../src/repositories/categoryRepository');

// Helper to create mock Express req/res
function createMockReqRes(options = {}) {
  const req = {
    method: options.method || 'GET',
    url: options.url || '/health',
    path: options.url || '/health',
    headers: options.headers || {},
    body: options.body || {},
    ip: options.ip || '127.0.0.1',
    query: options.query || {},
  };

  const headers = {};
  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
    removeHeader: (k) => { delete headers[k.toLowerCase()]; },
    getHeader: (k) => headers[k.toLowerCase()],
    get: (k) => headers[k.toLowerCase()],
    status: (code) => { statusCode = code; return res; },
    json: (data) => { responseData = data; return res; },
    send: (data) => { responseData = data; return res; },
    end: () => {},
  };

  return {
    req,
    res,
    getHeaders: () => headers,
    getStatus: () => statusCode,
    getBody: () => responseData,
  };
}

// ==============================================================================
// 1. HTTP SECURITY HEADERS & HELMET SUITE
// ==============================================================================
describe('1. Security Headers & Helmet Configuration', () => {
  test('COOP header should be same-origin-allow-popups for Google OAuth compatibility', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes();
    securityHeaders(req, res, () => {
      const headers = getHeaders();
      assert.equal(headers['cross-origin-opener-policy'], 'same-origin-allow-popups');
      done();
    });
  });

  test('Clickjacking protection (X-Frame-Options: DENY) is enforced', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes();
    securityHeaders(req, res, () => {
      const headers = getHeaders();
      assert.equal(headers['x-frame-options'], 'DENY');
      done();
    });
  });

  test('MIME-type sniffing prevention (X-Content-Type-Options: nosniff) is enforced', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes();
    securityHeaders(req, res, () => {
      const headers = getHeaders();
      assert.equal(headers['x-content-type-options'], 'nosniff');
      done();
    });
  });

  test('HSTS is enforced without premature preload or subdomains', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes();
    securityHeaders(req, res, () => {
      const headers = getHeaders();
      assert.ok(headers['strict-transport-security']);
      assert.ok(headers['strict-transport-security'].includes('max-age=31536000'));
      assert.equal(headers['strict-transport-security'].includes('preload'), false);
      done();
    });
  });
});

// ==============================================================================
// 2. STRICT CORS ORIGIN VERIFICATION SUITE
// ==============================================================================
describe('2. Strict CORS Origin Filtering', () => {
  test('Allows trusted production frontend: https://experiencetracker.vercel.app', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes({
      headers: { origin: 'https://experiencetracker.vercel.app' },
    });
    corsProtection(req, res, (err) => {
      assert.ifError(err);
      assert.equal(getHeaders()['access-control-allow-origin'], 'https://experiencetracker.vercel.app');
      done();
    });
  });

  test('Allows secondary verified frontend: https://expensivetracker-three.vercel.app', (t, done) => {
    const { req, res, getHeaders } = createMockReqRes({
      headers: { origin: 'https://expensivetracker-three.vercel.app' },
    });
    corsProtection(req, res, (err) => {
      assert.ifError(err);
      assert.equal(getHeaders()['access-control-allow-origin'], 'https://expensivetracker-three.vercel.app');
      done();
    });
  });

  test('Rejects arbitrary untrusted origin with 403 CORS_FORBIDDEN', (t, done) => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      headers: { origin: 'https://malicious-attacker.com' },
    });
    corsProtection(req, res, (err) => {
      assert.ok(err);
      assert.equal(err.status, 403);
      errorHandler(err, req, res, () => {});
      assert.equal(getStatus(), 403);
      assert.equal(getBody().code, 'CORS_FORBIDDEN');
      done();
    });
  });

  test('Strictly rejects third-party arbitrary *.vercel.app attacker origins', (t, done) => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      headers: { origin: 'https://attacker-app.vercel.app' },
    });
    corsProtection(req, res, (err) => {
      assert.ok(err);
      assert.equal(err.status, 403);
      errorHandler(err, req, res, () => {});
      assert.equal(getStatus(), 403);
      assert.equal(getBody().code, 'CORS_FORBIDDEN');
      done();
    });
  });
});

// ==============================================================================
// 3. RATE LIMITER KEY GENERATION & ABUSE MITIGATION
// ==============================================================================
describe('3. Rate Limiter Key Generation & Abuse Mitigation', () => {
  test('authLimiter keys by client IP and normalized lowercase account identifier', () => {
    const req = {
      ip: '198.51.100.24',
      body: { username: '  Alex.Admin@Company.COM  ' },
    };
    const key = authKeyGenerator(req);
    assert.ok(key);
    assert.ok(key.includes('alex.admin@company.com'));
    assert.equal(key.includes('Alex.Admin'), false);
  });

  test('otpLimiter keys by client IP and target email', () => {
    const req = {
      ip: '203.0.113.195',
      body: { email: 'TargetUser@domain.ORG' },
    };
    const key = otpKeyGenerator(req);
    assert.ok(key);
    assert.ok(key.includes('targetuser@domain.org'));
  });
});

// ==============================================================================
// 4. IDOR & MULTI-TENANT USER DATA ISOLATION SUITE
// ==============================================================================
describe('4. IDOR & User Data Isolation', () => {
  const userA = { id: 101, username: 'usera', role: 'ROLE_USER', user_group_id: null };
  const userB = { id: 102, username: 'userb', role: 'ROLE_USER', user_group_id: null };
  const groupUser1 = { id: 201, username: 'groupuser1', role: 'ROLE_USER', user_group_id: 10 };
  const groupUser2 = { id: 202, username: 'groupuser2', role: 'ROLE_USER', user_group_id: 20 };

  const txnA = {
    id: 8888,
    amount: 1500.00,
    description: 'User A Secret Transaction',
    type: 'EXPENSE',
    user_id: 101,
    user_group_id: null,
  };

  const accountA = {
    id: 5555,
    name: 'User A Private Savings',
    user_id: 101,
    is_active: 1,
  };

  const budgetA = {
    id: 3333,
    name: 'User A Private Budget',
    user_id: 101,
    user_group_id: null,
    is_active: 1,
  };

  // Mock repository methods
  transactionRepository.findById = async (id) => (id === 8888 ? { ...txnA } : null);
  userRepository.findByIdWithUserGroup = async (id) => {
    if (id === 101) return { ...userA };
    if (id === 102) return { ...userB };
    if (id === 201) return { ...groupUser1 };
    if (id === 202) return { ...groupUser2 };
    return null;
  };
  accountRepository.findById = async (id) => (id === 5555 ? { ...accountA } : null);
  budgetRepository.findById = async (id) => (id === 3333 ? { ...budgetA } : null);

  test('User A can successfully retrieve their own transaction', async () => {
    const txn = await transactionService.getTransaction(userA, 8888);
    assert.equal(txn.id, 8888);
    assert.equal(txn.user_id, 101);
  });

  test('User B is blocked from reading User A transaction (masked 404)', async () => {
    await assert.rejects(
      async () => { await transactionService.getTransaction(userB, 8888); },
      { message: 'Transaction not found' }
    );
  });

  test('User B is blocked from updating User A transaction', async () => {
    await assert.rejects(
      async () => {
        await transactionService.updateTransaction(userB, 8888, {
          amount: 50000,
          description: 'Hacked',
        });
      },
      /Transaction not found|Access denied/
    );
  });

  test('User B is blocked from deleting User A transaction', async () => {
    await assert.rejects(
      async () => { await transactionService.deleteTransaction(userB, 8888); },
      /Transaction not found|Access denied/
    );
  });

  test('Cross-group isolation: User from Group 2 cannot access Group 1 transaction', async () => {
    const group1Txn = { id: 7777, amount: 200, user_id: 201, user_group_id: 10 };
    transactionRepository.findById = async (id) => (id === 7777 ? group1Txn : (id === 8888 ? txnA : null));

    await assert.rejects(
      async () => { await transactionService.getTransaction(groupUser2, 7777); },
      { message: 'Transaction not found' }
    );
  });

  test('Account isolation: User B is blocked from reading User A account (masked 404)', async () => {
    await assert.rejects(
      async () => { await accountService.getAccount(userB, 5555); },
      { message: 'Account not found' }
    );
  });

  test('Budget isolation: User B is blocked from reading User A budget (masked 404)', async () => {
    await assert.rejects(
      async () => { await budgetService.getBudget(userB, 3333); },
      { message: 'Budget not found' }
    );
  });
});

// ==============================================================================
// 5. RECURRING TRANSACTIONS & IDEMPOTENCY
// ==============================================================================
describe('5. Recurring Transaction Reliability & Idempotency', () => {
  test('calculateNextDueDate advances date forward into the future', () => {
    const baseDate = '2026-01-01';
    const nextDaily = recurringTransactionService.calculateNextDueDate(baseDate, 'DAILY');
    const nextWeekly = recurringTransactionService.calculateNextDueDate(baseDate, 'WEEKLY');
    const nextMonthly = recurringTransactionService.calculateNextDueDate(baseDate, 'MONTHLY');

    assert.equal(nextDaily, '2026-01-02');
    assert.equal(nextWeekly, '2026-01-08');
    assert.equal(nextMonthly, '2026-02-01');
  });

  test('executeRecurringTransaction rejects inactive recurring schedules', async () => {
    const recurringTransactionRepository = require('../src/repositories/recurringTransactionRepository');
    recurringTransactionRepository.findById = async () => ({
      id: 99,
      is_active: 0,
      user_id: 101,
    });

    await assert.rejects(
      async () => {
        await recurringTransactionService.executeRecurringTransaction(99, { id: 101 });
      },
      { message: 'Cannot execute inactive recurring transaction' }
    );
  });

  test('Concurrent execution idempotency: executing recurring transaction twice on same day only creates 1 transaction', async () => {
    const recurringTransactionRepository = require('../src/repositories/recurringTransactionRepository');
    const today = new Date().toISOString().split('T')[0];
    
    const mockRt = {
      id: 777,
      amount: 120.00,
      description: 'Monthly Cloud Subscription',
      type: 'EXPENSE',
      recurrence_type: 'MONTHLY',
      next_due_date: today,
      is_active: 1,
      user_id: 101,
      category_id: 1,
      account_id: 1,
    };

    const createdTransactions = [];
    recurringTransactionRepository.findById = async () => ({ ...mockRt });
    recurringTransactionRepository.update = async () => {};
    accountRepository.updateBalance = async () => {};
    
    transactionRepository.findByRecurringAndDate = async (rtId, date) => {
      return createdTransactions.filter(t => t.recurring_transaction_id === rtId && t.transaction_date === date);
    };
    
    transactionRepository.create = async (txn) => {
      const created = { id: 1000 + createdTransactions.length, ...txn };
      createdTransactions.push(created);
      return created;
    };

    // Simulate two concurrent or consecutive execution triggers
    await Promise.all([
      recurringTransactionService.executeRecurringTransaction(777, { id: 101 }),
      recurringTransactionService.executeRecurringTransaction(777, { id: 101 }),
    ]);

    assert.equal(createdTransactions.length, 1, 'Only one transaction should be created across concurrent triggers');
  });
});

// ==============================================================================
// 6. AUTHENTICATION & JWT SECURITY SUITE
// ==============================================================================
describe('6. Authentication & JWT Integrity', () => {
  const mockUser = { id: 50, username: 'testuser', role: 'ROLE_USER' };

  test('Generates valid token and successfully verifies with expected payload', () => {
    const token = generateToken(mockUser);
    assert.ok(token);
    const decoded = verifyToken(token);
    assert.equal(decoded.userId, 50);
    assert.equal(decoded.sub, 'testuser');
    assert.equal(decoded.role, 'ROLE_USER');
  });

  test('Rejects tampered JWT signatures', () => {
    const token = generateToken(mockUser);
    // Tamper with payload by replacing characters in the body
    const parts = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 50, role: 'ROLE_ADMIN', sub: 'hacked' })).toString('base64');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

    const decoded = verifyToken(tamperedToken);
    assert.equal(decoded, null);
  });

  test('Rejects expired JWT tokens', () => {
    // Manually forge an expired token
    const secret = process.env.JWT_SECRET || 'mySecretKey123456789012345678901234567890123456789012345678901234567890';
    const expiredToken = jwt.sign(
      { userId: 50, sub: 'testuser', role: 'ROLE_USER' },
      secret,
      { algorithm: 'HS512', expiresIn: -10 } // Expired 10 seconds ago
    );

    const decoded = verifyToken(expiredToken);
    assert.equal(decoded, null);
  });

  test('authenticate middleware blocks requests without Authorization header with 401', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes();
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 401);
    assert.equal(getBody().code, '401');
  });

  test('authenticate middleware blocks invalid or forged tokens with 401', async () => {
    const { req, res, getStatus, getBody } = createMockReqRes({
      headers: { authorization: 'Bearer invalid.bogus.token' },
    });
    let nextCalled = false;
    await authenticate(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 401);
    assert.equal(getBody().code, '401');
  });
});

// ==============================================================================
// 7. PASSWORD RESET ABUSE & BOUNDARY DEFENSE
// ==============================================================================
describe('7. Password Reset Abuse & Boundary Defense', () => {
  const passwordResetService = require('../src/services/passwordResetService');
  const emailOtpRepository = require('../src/repositories/emailOtpRepository');
  const passwordResetTokenRepository = require('../src/repositories/passwordResetTokenRepository');

  test('Rejects expired OTP at exact expiration boundary with 410 OTP_EXPIRED', async () => {
    userRepository.findByUsernameOrEmail = async () => ({ id: 101, email: 'victim@example.com', username: 'victim' });
    emailOtpRepository.findLatestUnverifiedByEmail = async () => ({
      id: 1,
      otp: '123456',
      expires_at: new Date(Date.now() - 1000), // Expired 1 second ago
      attempts: 0,
    });
    emailOtpRepository.findLatestVerifiedByEmail = async () => null;
    emailOtpRepository.deleteByEmail = async () => {};

    await assert.rejects(
      async () => {
        await passwordResetService.resetPasswordWithOtp('victim@example.com', '123456', 'NewPassword123');
      },
      { code: 'OTP_EXPIRED', status: 410 }
    );
  });

  test('Purges OTP after password reset to strictly prevent replay and OTP reuse attacks', async () => {
    let otpDeleted = false;
    let userPasswordUpdated = false;

    userRepository.findByUsernameOrEmail = async () => ({ id: 101, email: 'victim@example.com', username: 'victim' });
    userRepository.update = async () => { userPasswordUpdated = true; };
    emailOtpRepository.findLatestUnverifiedByEmail = async () => ({
      id: 1,
      otp: '123456',
      expires_at: new Date(Date.now() + 60000),
      attempts: 0,
    });
    emailOtpRepository.deleteByEmail = async () => { otpDeleted = true; };
    passwordResetTokenRepository.deleteByUserId = async () => {};

    await passwordResetService.resetPasswordWithOtp('victim@example.com', '123456', 'NewValidPassword123');

    assert.equal(userPasswordUpdated, true);
    assert.equal(otpDeleted, true, 'OTP must be purged from database upon successful password reset');
  });

  test('Rejects already-used password reset tokens with 410 TOKEN_ALREADY_USED', async () => {
    passwordResetTokenRepository.findByToken = async () => ({
      id: 1,
      token: 'used-uuid-token',
      used: 1,
      expiry_date: new Date(Date.now() + 60000),
      user_id: 101,
    });

    await assert.rejects(
      async () => {
        await passwordResetService.resetPassword('used-uuid-token', 'NewValidPassword123');
      },
      { code: 'TOKEN_ALREADY_USED', status: 410 }
    );
  });

  test('Rejects non-existent or forged reset tokens with 400 TOKEN_INVALID', async () => {
    passwordResetTokenRepository.findByToken = async () => null;

    await assert.rejects(
      async () => {
        await passwordResetService.resetPassword('forged-token-xyz', 'NewValidPassword123');
      },
      { code: 'TOKEN_INVALID', status: 400 }
    );
  });

  test('Rejects unknown user or non-existent email during reset lookup with USER_NOT_FOUND', async () => {
    userRepository.findByUsernameOrEmail = async () => null;
    userRepository.findByEmail = async () => null;
    userRepository.findByUsername = async () => null;

    await assert.rejects(
      async () => {
        await passwordResetService.resetPasswordWithOtp('nonexistent@example.com', '123456', 'NewValidPassword123');
      },
      { code: 'USER_NOT_FOUND', status: 404 }
    );
  });

  test('Enforces minimum 6-character password constraint during reset with PASSWORD_TOO_SHORT', async () => {
    userRepository.findByUsernameOrEmail = async () => ({ id: 101, email: 'victim@example.com', username: 'victim' });
    emailOtpRepository.findLatestUnverifiedByEmail = async () => ({
      id: 1,
      otp: '123456',
      expires_at: new Date(Date.now() + 60000),
      attempts: 0,
    });

    await assert.rejects(
      async () => {
        await passwordResetService.resetPasswordWithOtp('victim@example.com', '123456', '123');
      },
      { code: 'PASSWORD_TOO_SHORT', status: 400 }
    );
  });
});
