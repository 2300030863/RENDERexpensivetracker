function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err.stack || err.message || err);

  // Handle CORS firewall rejection
  if (err.message && err.message.includes('CORS Firewall')) {
    return res.status(403).json({
      success: false,
      error: 'Access denied: Origin not authorized by security policy',
      code: 'CORS_FORBIDDEN',
      status: 403,
      timestamp: new Date().toISOString(),
    });
  }

  // Handle Payload Too Large
  if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({
      success: false,
      error: 'Payload Too Large: Request exceeds maximum allowed size (1MB)',
      code: 'PAYLOAD_TOO_LARGE',
      status: 413,
      timestamp: new Date().toISOString(),
    });
  }

  const status = err.status || err.statusCode || 500;
  const isInternal = status >= 500;
  
  // Shield internal implementation details and stack traces in production
  const message = (process.env.NODE_ENV === 'production' && isInternal)
    ? 'An unexpected server error occurred. Please try again later.'
    : (err.message || 'Internal Server Error');

  const code = err.code || (err.errorCode) || (isInternal ? 'INTERNAL_SERVER_ERROR' : String(status));

  res.status(status).json({
    success: false,
    error: message,
    code,
    status,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
