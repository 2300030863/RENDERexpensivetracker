const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Load environment variables before anything reads them
dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

const { initializeSchema } = require('./config/database');
const { initializeData } = require('./config/dataInitializer');
const { initRecurringJobs, runRecurringCatchUp } = require('./cron/recurringJobs');
const apiRouter = require('./routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { sanitizeResponse } = require('./middleware/sanitizeResponse');

const app = express();
const PORT = process.env.PORT || 8086;

// 1. Trust the reverse proxy (Render/Vercel/Cloudflare) so client IPs are accurate for rate limiting
app.set('trust proxy', 1);
app.disable('x-powered-by');

// 2. HTTP security headers. This is a JSON API: it never serves HTML, so a locked-down CSP is safe.
app.use(
  helmet({
    crossOriginOpenerPolicy: false, // Allow the Google OAuth popup to talk back to the frontend
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: false,
    },
  })
);

// 3. Rate limiting
const rateLimitMessage = (error) => ({ error, status: 429 });

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage('Too many requests. Please try again in a few minutes.'),
});
app.use(globalLimiter);

// Strict limiter for credential-style endpoints (brute force / credential stuffing / OTP guessing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT, 10) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: rateLimitMessage('Too many attempts. For your security, please wait 15 minutes and try again.'),
});
const authPaths = ['login', 'register', 'send-otp', 'verify-otp', 'forgot-password', 'reset-password', 'google'];
for (const name of authPaths) {
  app.use([`/expense-tracker-api/auth/${name}`, `/auth/${name}`], authLimiter);
}

// Request logging - path only. Query strings can carry tokens, OTP codes and e-mail addresses.
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.path} -> ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// 4. CORS: exact origins only. There is no wildcard for *.vercel.app - anyone can host a page there.
function parseOrigins(value) {
  return (value || '')
    .split(',')
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

const allowedOrigins = new Set([
  'https://experiencetracker.vercel.app',
  ...parseOrigins(process.env.FRONTEND_URL),
  ...parseOrigins(process.env.CORS_ORIGINS),
]);

if (!isProduction) {
  ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000', 'http://127.0.0.1:5173'].forEach(
    (o) => allowedOrigins.add(o)
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Requests without an Origin header (health checks, curl, server-to-server) are not browser CORS requests.
      if (!origin) return callback(null, true);
      // Unknown origins simply do not receive CORS headers, so the browser blocks them.
      return callback(null, allowedOrigins.has(origin));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    maxAge: 600,
  })
);

// 5. Body parsers with sensible limits
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 6. Never let a password hash leave the API, whatever a controller returns
app.use(sanitizeResponse);

// Root status route
app.get('/', (req, res) => {
  res.json({ status: 'UP', service: 'Expense Tracker API' });
});

// Dual mounting keeps compatibility with frontends configured with or without the context path
app.use('/expense-tracker-api', apiRouter);
app.use('/', apiRouter);

// 404 + centralized error handling (must be last)
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
const server = app.listen(PORT, async () => {
  console.log(`🚀 Expense Tracker server listening on port ${PORT}`);

  try {
    await initializeSchema();
    await initializeData();
    console.log('✅ Database schema and seed data verified.');
  } catch (err) {
    console.warn('⚠️ Database initialization error on startup (check network/credentials):', err.message);
  }

  try {
    initRecurringJobs();
    // Free hosting tiers sleep, so a midnight-only job can be missed entirely.
    // Catch up on anything that became due while the server was down.
    runRecurringCatchUp();
  } catch (err) {
    console.warn('⚠️ Failed to start recurring transaction jobs:', err.message);
  }
});

// Keep a single bad request or promise from taking the whole server down silently
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason && reason.message ? reason.message : reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('💤 HTTP server closed.');
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;
