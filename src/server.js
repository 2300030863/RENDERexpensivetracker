const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables
dotenv.config();

const { initializeSchema } = require('./config/database');
const { initializeData } = require('./config/dataInitializer');
const { initRecurringJobs } = require('./cron/recurringJobs');
const apiRouter = require('./routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 8086;

// 1. Trust Reverse Proxy (Required for Render, Vercel, and Cloudflare to get accurate client IP)
app.set('trust proxy', 1);

// 2. HTTP Security Firewall (Helmet)
app.use(
  helmet({
    crossOriginOpenerPolicy: false, // Disabled to allow Google OAuth popup window.closed inspection
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: false, // Handled per-frontend via Vercel headers
    hidePoweredBy: true, // Strips 'X-Powered-By: Express' to prevent stack fingerprinting
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// 3. Application Firewall Rate Limiters
// Global Rate Limiter: max 500 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP address, please try again after 15 minutes.',
  },
});
app.use('/expense-tracker-api', globalLimiter);
app.use('/api', globalLimiter);

// Strict Authentication Firewall: Protects login, registration, OTP, and password reset against brute force / credential stuffing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 20 attempts per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. For your security, this account action is temporarily locked for 15 minutes.',
  },
});

app.use(['/expense-tracker-api/auth/login', '/auth/login'], authLimiter);
app.use(['/expense-tracker-api/auth/register', '/auth/register'], authLimiter);
app.use(['/expense-tracker-api/auth/send-otp', '/auth/send-otp'], authLimiter);
app.use(['/expense-tracker-api/auth/verify-otp', '/auth/verify-otp'], authLimiter);
app.use(['/expense-tracker-api/auth/forgot-password', '/auth/forgot-password'], authLimiter);
app.use(['/expense-tracker-api/auth/reset-password', '/auth/reset-password'], authLimiter);

// Middleware - Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// Middleware - CORS Firewall
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like health checks, mobile apps, curl)
      if (!origin) return callback(null, true);

      // Check if origin matches allowed list or regex for Vercel preview/production URLs
      const isAllowed =
        allowedOrigins.includes(origin) ||
        /\.vercel\.app$/.test(origin) ||
        (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:'));

      if (isAllowed) {
        callback(null, true);
      } else {
        // In production, reject unauthorized origins
        if (process.env.NODE_ENV === 'production') {
          return callback(new Error('Blocked by CORS Firewall: Origin not allowed'), false);
        }
        callback(null, true);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['Authorization'],
  })
);

// Middleware - Body parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

