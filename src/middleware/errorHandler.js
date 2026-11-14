function errorHandler(err, req, res, next) {
  console.error('[Error Handler]', err);

  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  res.status(status).json({
    error: message,
    status,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
