const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'mySecretKey123456789012345678901234567890123456789012345678901234567890';
const JWT_EXPIRATION = process.env.JWT_EXPIRATION || '86400000'; // 24 hours in ms

/**
 * Generate JWT token matching Spring Boot JwtTokenUtil
 */
function generateToken(user) {
  const payload = {
    userId: user.id,
    role: user.role,
    sub: user.username,
  };

  // Convert expiration ms to seconds for jsonwebtoken if numeric
  let expiresIn = '24h';
  if (!isNaN(JWT_EXPIRATION)) {
    expiresIn = Math.floor(parseInt(JWT_EXPIRATION, 10) / 1000);
  }

  return jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS512',
    expiresIn,
  });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS512', 'HS256'],
    });
  } catch (error) {
    return null;
  }
}

/**
 * Decode JWT token without verifying (e.g. for Google OAuth payload)
 */
function decodeToken(token) {
  return jwt.decode(token);
}

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  JWT_SECRET,
};

