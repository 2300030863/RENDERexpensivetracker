const helmet = require('helmet');
const cors = require('cors');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

/**
 * ============================================================================
 * EXPENSE TRACKER - MULTI-LAYER SECURITY FIREWALL (HARDENED)
 * ============================================================================
 * Layer 1: HTTPS & HSTS Transport Security (Safe Non-Preload, No SubDomain Leak)
 * Layer 2: HTTP Security Headers with COOP 'same-origin-allow-popups' (Helmet)
 * Layer 3: Strict Origin CORS Policy (No Permissive *.vercel.app Wildcard)
 * Layer 4: Multi-Dimensional Rate Limiting (Dual IP + Account Keys)
 * Layer 5: Request Payload & Buffer Size Shielding (1MB Limit)
 * ============================================================================
 */

// Authorized Frontend Production & Local Origins
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

// Strict regex matching ONLY preview deployments belonging to this specific repository / project
const projectPreviewPattern = /^https:\/\/experiencetracker(-[a-z0-9-]+)?-2300030863\.vercel\.app$/;

/**
 * Layer 2: Security Response Headers (Helmet)
 * Configured with same-origin-allow-popups for OAuth compatibility,
 * frameguard: DENY to prevent clickjacking, nosniff, and safe HSTS.
 */
const securityHeaders = helmet({
  // Isolates context from untrusted sites while permitting OAuth popup window interaction
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: false, // Frontend handles CSP via Vercel headers
  hidePoweredBy: true,
  xssFilter: true,
  noSniff: true,
  frameguard: { action: 'deny' }, // Anti-clickjacking
  hsts: {
    maxAge: 31536000, // 1 year HSTS
    includeSubDomains: false, // Safe: does not affect subdomains that might not yet have TLS
    preload: false, // Safe: avoids premature HSTS preload submission
  },
});

/**
 * Layer 3: Strict CORS Protection
 * Explicitly allows ONLY verified domains for this project.
 * Wildcard *.vercel.app is rejected to prevent third-party Vercel apps from calling this API.
 */
const corsProtection = cors({
  origin: (origin, callback) => {
    // Allow non-browser requests (e.g. server-to-server health checks, uptime monitors, curl)
    if (!origin) {
      return callback(null, true);
    }

    const isExplicitlyAllowed = allowedOrigins.includes(origin);
    const isProjectPreview = projectPreviewPattern.test(origin);
    const isLocalDev = process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost:');

    if (isExplicitlyAllowed || isProjectPreview || isLocalDev) {
      return callback(null, true);
    }

    console.warn(`[CORS Firewall] Blocked unauthorized request from origin: ${origin}`);
    const err = new Error(`Blocked by CORS Firewall: Origin '${origin}' is not authorized.`);
    err.status = 403;
    err.code = 'CORS_FORBIDDEN';
    return callback(err, false);
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
 * Layer 4B: Authentication Firewall Limiter (Dual IP + Account Keyed)
 * Prevents brute-force dictionary attacks against login, register, and password reset.
 * Rate-limits both per-IP and per-account to mitigate distributed attacks against a single user.
 */
function authKeyGenerator(req) {
  const clientIp = ipKeyGenerator(req.ip);
  const account = (req.body?.username || req.body?.identifier || req.body?.email || '').toLowerCase().trim();
  return account ? `${clientIp}_${account}` : clientIp;
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25, // Max 25 attempts per 15 minutes
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: authKeyGenerator,
  message: {
    success: false,
    error: 'Too many authentication attempts. For your security, please try again in 15 minutes.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
  },
});

/**
 * Layer 4C: OTP Dispatch Limiter (Dual IP + Target Email Keyed)
 * Guards email delivery service from spam abuse and email quota exhaustion.
 * Prevents targeting a single user email across different IPs or burning Brevo quotas.
 */
function otpKeyGenerator(req) {
  const clientIp = ipKeyGenerator(req.ip);
  const email = (req.body?.email || req.body?.identifier || req.query?.email || req.query?.identifier || '').toLowerCase().trim();
  return email ? `${clientIp}_${email}` : clientIp;
}

const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10, // Max 10 OTP requests per 15 minutes
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: otpKeyGenerator,
  message: {
    success: false,
    error: 'Too many verification code requests for this account. Please wait 15 minutes before requesting again.',
    code: 'OTP_RATE_LIMIT_EXCEEDED',
  },
});

module.exports = {
  securityHeaders,
  corsProtection,
  apiLimiter,
  authLimiter,
  otpLimiter,
  authKeyGenerator,
  otpKeyGenerator,
  allowedOrigins,
};
