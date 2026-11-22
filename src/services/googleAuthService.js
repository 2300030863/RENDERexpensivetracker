const { HttpError } = require('../utils/httpError');

// The OAuth client ID is public (it is embedded in the frontend). It can be overridden per deployment.
const GOOGLE_CLIENT_ID =
  process.env.GOOGLE_CLIENT_ID || '323113584930-qff55p96cturm9gdk1k3vki075o7h8dg.apps.googleusercontent.com';

const TIMEOUT_MS = 8000;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(TIMEOUT_MS) });
  let body = null;
  try {
    body = await response.json();
  } catch (_) {
    /* non-JSON error body */
  }
  return { ok: response.ok, status: response.status, body };
}

const invalid = (msg = 'Google sign-in could not be verified') => new HttpError(401, msg, '401');

/**
 * Verify a token with Google and return the account's profile.
 * Accepts either an OAuth access token (what the frontend sends) or an ID token (JWT).
 * The caller must never trust an email address that did not come from here.
 */
async function verifyGoogleToken(token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw invalid('Google sign-in token is missing or malformed');
  }

  try {
    const looksLikeJwt = token.split('.').length === 3;

    if (looksLikeJwt) {
      const { ok, body } = await fetchJson(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token)}`
      );
      if (!ok || !body) throw invalid('Google ID token could not be verified');
      const tokenAud = body.aud || body.azp;
      if (tokenAud !== GOOGLE_CLIENT_ID) {
        throw invalid('Google sign-in verification failed: Client ID mismatch');
      }
      if (!body.email || String(body.email_verified) !== 'true') {
        throw new HttpError(401, 'Your Google email address is not verified', '401');
      }
      return {
        email: String(body.email).toLowerCase(),
        firstName: body.given_name || body.name || '',
        lastName: body.family_name || '',
      };
    }

    // 1. The token must have been issued to OUR OAuth client (blocks tokens minted for other apps).
    const info = await fetchJson(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
    );
    if (!info.ok || !info.body) {
      throw invalid('Google access token is invalid or has expired. Please sign in again.');
    }
    const tokenAudience = info.body.issued_to || info.body.audience || info.body.aud || info.body.azp;
    if (tokenAudience !== GOOGLE_CLIENT_ID) {
      console.warn(`Google OAuth client ID mismatch: received '${tokenAudience}', expected '${GOOGLE_CLIENT_ID}'`);
      throw invalid('Google sign-in verification failed: Client ID mismatch');
    }

    // 2. Read the profile from Google itself.
    const profile = await fetchJson('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!profile.ok || !profile.body || !profile.body.email) {
      throw invalid('Could not retrieve user profile from Google. Please try again.');
    }
    if (profile.body.email_verified !== true && String(profile.body.email_verified) !== 'true') {
      throw new HttpError(401, 'Your Google email address is not verified', '401');
    }

    return {
      email: String(profile.body.email).toLowerCase(),
      firstName: profile.body.given_name || profile.body.name || '',
      lastName: profile.body.family_name || '',
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('Google token verification failed:', error.message);
    throw new HttpError(503, 'Google sign-in is temporarily unavailable. Please try again.', '503');
  }
}

module.exports = { verifyGoogleToken };
