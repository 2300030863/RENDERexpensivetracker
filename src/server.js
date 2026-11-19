const express = require('express');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const { initializeSchema } = require('./config/database');
const { initializeData } = require('./config/dataInitializer');
const { initRecurringJobs } = require('./cron/recurringJobs');
const apiRouter = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');
const {
  securityHeaders,
  corsProtection,
  apiLimiter,
  authLimiter,
  otpLimiter,
} = require('./middleware/security');

const app = express();
const PORT = process.env.PORT || 8086;

// 1. Trust Reverse Proxy (Configurable via TRUST_PROXY; defaults to 1 hop for Render edge)
const trustProxyVal = process.env.TRUST_PROXY !== undefined 
  ? (isNaN(process.env.TRUST_PROXY) ? process.env.TRUST_PROXY : parseInt(process.env.TRUST_PROXY, 10))
  : 1;
app.set('trust proxy', trustProxyVal);

// 2. Disable framework fingerprinting
app.disable('x-powered-by');

// 3. HTTP Security Headers (Helmet)
app.use(securityHeaders);

// 4. Strict Cross-Origin Resource Sharing (CORS) Protection
app.use(corsProtection);

// 5. Restrict incoming request body payload size (DoS & memory protection)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. Security Rate Limiters (Application Firewall)
// Auth Limiter: protects login, register, password reset
app.use(['/expense-tracker-api/auth/login', '/auth/login'], authLimiter);
app.use(['/expense-tracker-api/auth/register', '/auth/register'], authLimiter);
app.use(['/expense-tracker-api/auth/forgot-password', '/auth/forgot-password'], authLimiter);
app.use(['/expense-tracker-api/auth/reset-password', '/auth/reset-password'], authLimiter);

// OTP Limiter: protects send-otp and verify-otp against email abuse and brute force
app.use(['/expense-tracker-api/auth/send-otp', '/auth/send-otp'], otpLimiter);
app.use(['/expense-tracker-api/auth/verify-otp', '/auth/verify-otp'], authLimiter);

// General API Limiter: protects transaction, category, budget, report endpoints
app.use(['/expense-tracker-api/transactions', '/transactions'], apiLimiter);
app.use(['/expense-tracker-api/categories', '/categories'], apiLimiter);
app.use(['/expense-tracker-api/accounts', '/accounts'], apiLimiter);
app.use(['/expense-tracker-api/budgets', '/budgets'], apiLimiter);
app.use(['/expense-tracker-api/analytics', '/analytics'], apiLimiter);
app.use(['/expense-tracker-api/recurring-transactions', '/recurring-transactions'], apiLimiter);
app.use(['/expense-tracker-api/profile', '/profile'], apiLimiter);
app.use(['/expense-tracker-api/admin', '/admin'], apiLimiter);

// 7. Request auditing & performance logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Root welcome / status route
app.get('/', (req, res) => {
  res.json({
    status: 'UP',
    message: 'Expense Tracker Backend API (Node.js)',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      actuator: '/actuator/health',
      apiPrefix: '/expense-tracker-api',
    },
  });
});

// Dual mounting: mount apiRouter on both '/expense-tracker-api' and root '/'
// This ensures full backward compatibility with any frontend configuration (with or without servlet context path)
app.use('/expense-tracker-api', apiRouter);
app.use('/', apiRouter);

// Centralized error handling
app.use(errorHandler);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Expense Tracker Node.js Server listening on port ${PORT}`);
  console.log(`📡 Endpoints active on http://localhost:${PORT}/ and http://localhost:${PORT}/expense-tracker-api/`);

  // Initialize Database Schema & Seed Data
  try {
    console.log('🔄 Verifying and initializing database schema...');
    await initializeSchema();
    console.log('✅ Database schema verified.');

    console.log('🔄 Initializing default seed data...');
    await initializeData();
    console.log('✅ Default seed data verified.');
  } catch (err) {
    console.warn('⚠️ Warning: Database initialization error on startup (check network/credentials):', err.message);
  }

  // Initialize recurring background jobs
  try {
    initRecurringJobs();
  } catch (err) {
    console.warn('⚠️ Warning: Failed to start background cron job:', err.message);
  }
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('💤 HTTP server closed.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;

