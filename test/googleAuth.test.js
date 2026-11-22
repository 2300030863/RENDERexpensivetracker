const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { verifyGoogleToken } = require('../src/services/googleAuthService');
const { HttpError } = require('../src/utils/httpError');

describe('Google Authentication Token Verification', () => {
  test('Rejects missing or empty token with 401', async () => {
    await assert.rejects(
      async () => {
        await verifyGoogleToken('');
      },
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
        assert.ok(err.message.includes('missing or malformed'));
        return true;
      }
    );
  });

  test('Rejects tokens that are too short (< 20 characters)', async () => {
    await assert.rejects(
      async () => {
        await verifyGoogleToken('short-token-123');
      },
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
        assert.ok(err.message.includes('missing or malformed'));
        return true;
      }
    );
  });

  test('Rejects non-string tokens with 401', async () => {
    await assert.rejects(
      async () => {
        await verifyGoogleToken(12345678901234567890);
      },
      (err) => {
        assert.ok(err instanceof HttpError);
        assert.equal(err.status, 401);
        return true;
      }
    );
  });
});
