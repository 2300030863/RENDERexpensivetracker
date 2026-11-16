const { verifyToken } = require('../utils/jwt');
const userRepository = require('../repositories/userRepository');

const isBlocked = (val) => {
  if (val === null || val === undefined) return false;
  if (Buffer.isBuffer(val)) return val.length > 0 && val[0] === 1;
  return val === true || val === 1 || val === '1';
};

// Fast in-memory user cache to eliminate redundant remote DB lookups on rapid requests
const USER_CACHE_TTL_MS = 30000; // 30 seconds
const userCache = new Map();

function getCachedUser(id) {
  if (!id) return null;
  const entry = userCache.get(String(id));
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    userCache.delete(String(id));
    return null;
  }
  return entry.user;
}

function setCachedUser(id, user) {
  if (!id || !user) return;
  if (userCache.size > 5000) {
    const firstKey = userCache.keys().next().value;
    userCache.delete(firstKey);
  }
  userCache.set(String(id), {
    user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS,
  });
}

function invalidateUserAuthCache(id) {
  if (id) {
    userCache.delete(String(id));
  } else {
    userCache.clear();
  }
}

async function authenticate(req, res, next) {
  // Pass through preflight
  if (req.method === 'OPTIONS') {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided', code: '401', status: 401 });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token', code: '401', status: 401 });
  }

  try {
    let user = null;
    const lookupId = decoded.userId;

    if (lookupId) {
      user = getCachedUser(lookupId);
      if (!user) {
        user = await userRepository.findByIdWithUserGroup(lookupId);
        if (user) setCachedUser(lookupId, user);
      }
    }

    if (!user && decoded.sub) {
      user = await userRepository.findByUsername(decoded.sub);
      if (user) {
        user = await userRepository.findByIdWithUserGroup(user.id);
        if (user) setCachedUser(user.id, user);
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Unauthorized: User no longer exists', code: '401', status: 401 });
    }

    // Check if user is blocked (applies only to ROLE_USER)
    if (isBlocked(user.blocked) && user.role === 'ROLE_USER') {
      return res.status(403).json({
        error: 'Forbidden: Account is restricted',
        code: '403',
        status: 403,
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
  invalidateUserAuthCache,
};
