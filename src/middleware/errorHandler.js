const isProduction = process.env.NODE_ENV === 'production';

const NOT_FOUND_RE = /not found|no longer exists|does not exist/i;
const FORBIDDEN_RE = /access denied|permission|not allowed|forbidden|not authorized|only .* can/i;

function isDriverError(err) {
  return Boolean(
    err &&
      (err.sqlState ||
        err.errno ||
        (typeof err.code === 'string' && /^(ER_|PROTOCOL_|ECONN|ETIMEDOUT|ENOTFOUND|EAI_)/.test(err.code)))
  );
}

function isProgrammerError(err) {
  return (
    err instanceof TypeError ||
    err instanceof ReferenceError ||
    err instanceof RangeError ||
    err instanceof SyntaxError
  );
}

/**
 * Turn any thrown value into a safe { status, message } pair.
 * - Errors with an explicit status keep it (HttpError, OTP errors, ...).
 * - Plain `throw new Error('human message')` from our services are business-rule
 *   failures: 404 / 403 / 400 depending on the wording.
 * - Database, network and programming errors become a generic 500 and are never
 *   shown to the client.
 */
function classify(err) {
  if (err && err.type === 'entity.parse.failed') {
    return { status: 400, message: 'Invalid JSON in request body' };
  }
  if (err && err.type === 'entity.too.large') {
    return { status: 413, message: 'Request body is too large' };
  }

  const explicit = err && (err.status || err.statusCode);
  if (explicit && explicit >= 400 && explicit < 600) {
    const message = explicit >= 500 ? 'Internal server error' : err.message || 'Request failed';
    return { status: explicit, message };
  }

  if (isDriverError(err)) {
    if (err.code === 'ER_DUP_ENTRY') {
      return { status: 409, message: 'This record already exists' };
    }
    if (/^(ECONN|ETIMEDOUT|ENOTFOUND|EAI_|PROTOCOL_)/.test(err.code || '')) {
      return { status: 503, message: 'Service temporarily unavailable. Please try again.' };
    }
    return { status: 500, message: 'Internal server error' };
  }

  if (!err || isProgrammerError(err) || !err.message) {
    return { status: 500, message: 'Internal server error' };
  }

  if (NOT_FOUND_RE.test(err.message)) return { status: 404, message: err.message };
  if (FORBIDDEN_RE.test(err.message)) return { status: 403, message: err.message };
  return { status: 400, message: err.message };
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const { status, message } = classify(err);

  if (status >= 500) {
    console.error(`[Error] ${req.method} ${req.path}`, isProduction ? (err && err.message) || err : err);
  } else {
    console.warn(`[Warn] ${req.method} ${req.path} -> ${status}: ${message}`);
  }

  if (res.headersSent) return;

  const body = {
    error: message,
    status,
    timestamp: new Date().toISOString(),
  };
  if (err && err.code && typeof err.code === 'string' && !isDriverError(err)) {
    body.code = err.code;
  }
  res.status(status).json(body);
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Route not found',
    status: 404,
    timestamp: new Date().toISOString(),
  });
}

module.exports = errorHandler;
module.exports.errorHandler = errorHandler;
module.exports.notFoundHandler = notFoundHandler;
module.exports.classify = classify;
