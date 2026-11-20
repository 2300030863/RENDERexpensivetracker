const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Values that were published in the old source code / example file. Anyone can read them on GitHub,
// so a server using one of them can have tokens forged for ANY account (including the owner).
const PUBLISHED_SECRETS = ['mySecretKey123456789012345678901234567890123456789012345678901234567890'];

function isPlaceholderSecret(value) {
  return PUBLISHED_SECRETS.includes(value) || /^change-me/i.test(value);
}

function resolveSecret() {
  const configured = process.env.JWT_SECRET;

  if (configured && isPlaceholderSecret(configured)) {
    if (isProduction) {
      throw new Error(
        'JWT_SECRET is set to a publicly known/placeholder value. Generate a new one with: ' +
          `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
      );
    }
    console.warn('⚠️  JWT_SECRET is a placeholder value - fine for local development, never for production.');
  }

  if (configured && configured.length >= 32) {
    return configured;
  }

  if (isProduction) {
    // Refuse to start rather than sign tokens with a guessable key.
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
  }

  console.warn(
    '⚠️  JWT_SECRET is missing or shorter than 32 characters - using a random per-process secret. ' +
      'Tokens will stop working when the server restarts. Set JWT_SECRET in your .env file.'
  );
  return crypto.randomBytes(64).toString('hex');
}

const JWT_SECRET = resolveSecret();
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '28800000'; // 8 hours in ms

/**
 * Generate a signed access token.
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    sub: user.username,
  };

  // JWT_EXPIRATION is milliseconds (legacy Spring format); jsonwebtoken wants seconds.
  let expiresIn = '8h';
  if (!isNaN(JWT_EXPIRATION)) {
    expiresIn = Math.max(60, Math.floor(parseInt(JWT_EXPIRATION, 10) / 1000));
  }

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS512',
    expiresIn,
  });
}

/**
 * Verify an access token. Only the algorithm we sign with is accepted.
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS512'],
    });
  } catch (error) {
    return null;
  }
}

module.exports = {
  generateToken,
  verifyToken,
};
