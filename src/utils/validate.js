const { badRequest } = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{3,50}$/;

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeEmail(value) {
  return asString(value).trim().toLowerCase();
}

function isValidEmail(value) {
  const email = normalizeEmail(value);
  return email.length <= 100 && EMAIL_RE.test(email);
}

function isValidUsername(value) {
  return USERNAME_RE.test(asString(value).trim());
}

/**
 * Password policy: 8-72 characters (bcrypt ignores everything past 72 bytes),
 * at least one letter and one number.
 * Returns an error message, or null when the password is acceptable.
 */
function passwordPolicyError(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required';
  }
  if (password.length < 8) return 'Password must be at least 8 characters long';
  if (Buffer.byteLength(password, 'utf8') > 72) return 'Password must be at most 72 bytes long';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  return null;
}

function assertPassword(password) {
  const message = passwordPolicyError(password);
  if (message) {
    throw badRequest(message, 'PASSWORD_TOO_WEAK');
  }
}

/** Parse a positive integer route parameter. */
function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

module.exports = {
  normalizeEmail,
  isValidEmail,
  isValidUsername,
  passwordPolicyError,
  assertPassword,
  parseId,
  asString,
};
