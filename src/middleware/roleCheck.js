/**
 * Middleware to check user role
 * @param  {...string} roles - e.g. 'ROLE_USER', 'ROLE_ADMIN', 'ROLE_OWNER'
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: Authentication required' });
    }

    const userRole = req.user.role || 'ROLE_USER';

    // Check if user has any of the requested roles
    if (roles.includes(userRole)) {
      return next();
    }

    return res.status(403).json({
      error: 'Access denied: You do not have permission to access this resource',
    });
  };
}

module.exports = {
  requireRole,
};

