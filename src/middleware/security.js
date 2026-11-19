const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

/**
 * ============================================================================
 * EXPENSE TRACKER - MULTI-LAYER SECURITY FIREWALL
 * ============================================================================
 * Layer 1: HTTPS & HSTS Transport Security
 * Layer 2: HTTP Security Headers & Anti-Fingerprinting (Helmet)
 * Layer 3: Strict Origin CORS Policy
 * Layer 4: Anti-Brute-Force & Rate-Limiting Protection (API, Auth, OTP)
 * Layer 5: Payload Limits & Denial-of-Service (DoS) Shielding
 * ============================================================================
 */

// Authorized Frontend Origins
const allowedOrigins = [
  'https://experiencetracker.vercel.app',
  'https://expensivetracker-three.vercel.app',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

/**
 * Layer 2: Security Response Headers (Helmet)
 * Enforces HSTS, X-Content-Type-Options, FrameGuard (Anti-Clickjacking),
 * and removes X-Powered-By to prevent framework fingerprinting.
 */
const securityHeaders = helmet({
  crossOriginOpenerPolicy: false, // Preserves Google OAuth popup flow & window.closed detection
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: false, // Frontend handles CSP via Vercel headers
  hidePoweredBy: true,
  xssFilter: true,
  noSniff: true,
  frameguard: { action: 'deny' }, // Anti-clickjacking
  hsts: {
    maxAge: 31536000, // 1 year HSTS policy
    includeSubDomains: true,
    preload: true,
  },
});

/**
 * Layer 3: Strict CORS Protection
 * Restricts browser API access exclusively to trusted origins and valid Vercel preview domains.
 */
const corsProtection = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server health checks, monitoring, curl)
    if (!origin) {
      return callback(null, true);
    }

    const isExplicitlyAllowed = allowedOrigins.includes(origin);
    const isVercelPreview = /\.vercel\.app$/.test(origin);
    const isLocalDev = process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:');

    if (isExplicitlyAllowed || isVercelPreview || isLocalDev) {
      return callback(null, true);
    }

    console.warn(`[CORS Firewall] Blocked unauthorized request from origin: ${origin}`);
    return callback(new Error('Blocked by CORS Firewall: Origin not allowed'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Authorization'],
  credentials: true,
  maxAge: 600, // Cache preflight response for 10 minutes
});

/**
 * Layer 4A: Global API Rate Limiter
 * Protects standard resource queries from abusive scraping or DDoS spikes.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-minute sliding window
  limit: 500, // Max 500 requests per IP per window
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP address. Please try again after 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Layer 4B: Authentication Firewall Limiter
 * Prevents brute-force dictionary attacks against login, register, and password reset endpoints.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25, // Max 25 attempts per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many authentication attempts. For your security, please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Layer 4C: OTP Dispatch Limiter
 * Guards email delivery service from spam abuse and email quota exhaustion.
 */
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // Max 10 OTP requests per 15 minutes per IP
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many verification code requests. Please wait 15 minutes before requesting again.',
    code: 'OTP_RATE_LIMIT_EXCEEDED',
  },
});

module.exports = {
  securityHeaders,
  corsProtection,
  apiLimiter,
  authLimiter,
  otpLimiter,
  allowedOrigins,
};
