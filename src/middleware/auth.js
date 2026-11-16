const { verifyToken } = require('../utils/jwt');
const userRepository = require('../repositories/userRepository');

const isBlocked = (val) => {
  if (val === null || val === undefined) return false;
  if (Buffer.isBuffer(val)) return val.length > 0 && val[0] === 1;
  return val === true || val === 1 || val === '1';
};

async function authenticate(req, res, next) {
  // Pass through preflight
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  try {
    let user = null;
    if (decoded.userId) {
      user = await userRepository.findByIdWithUserGroup(decoded.userId);
    }
    if (!user && decoded.sub) {
      user = await userRepository.findByUsername(decoded.sub);
      if (user) {
        user = await userRepository.findByIdWithUserGroup(user.id);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User no longer exists' });
    }

    // Check if user is blocked (applies only to ROLE_USER)
    if (isBlocked(user.blocked) && user.role === 'ROLE_USER') {
      return res.status(403).json({
        error: 'Your account has been blocked by the administrator. Please contact support for assistance.',
      });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth Middleware Error:', err);
    return res.status(500).json({ error: 'Internal server error during authentication' });
  }
}

module.exports = {
  authenticate,
  authenticateToken: authenticate,
};
