/**
 * Defence in depth: no API response may ever contain a password (hash) field,
 * regardless of which controller built the payload.
 */
const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'passwordHash']);
const MAX_DEPTH = 12;

function strip(value, depth = 0) {
  if (value === null || typeof value !== 'object' || depth > MAX_DEPTH) return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((item) => strip(item, depth + 1));

  const clean = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key)) continue;
    clean[key] = strip(val, depth + 1);
  }
  return clean;
}

function sanitizeResponse(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = (body) => originalJson(strip(body));
  next();
}

module.exports = { sanitizeResponse, strip };
