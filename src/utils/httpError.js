/**
 * Error with an explicit HTTP status. Thrown from services/controllers and
 * turned into a clean JSON response by the central error handler.
 */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    if (code) this.code = code;
  }
}

const badRequest = (message, code) => new HttpError(400, message, code);
const unauthorized = (message = 'Unauthorized', code) => new HttpError(401, message, code);
const forbidden = (message = 'Access denied', code) => new HttpError(403, message, code);
const notFound = (message = 'Not found', code) => new HttpError(404, message, code);

module.exports = { HttpError, badRequest, unauthorized, forbidden, notFound };
