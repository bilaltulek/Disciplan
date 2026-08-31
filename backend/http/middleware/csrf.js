const crypto = require('crypto');
const { parseCookies } = require('../../middleware/auth');
const config = require('../../config.env');

const CSRF_COOKIE = 'disciplan_csrf';
const CSRF_HEADER = 'x-csrf-token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const appendCookie = (res, value) => {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) res.setHeader('Set-Cookie', value);
  else res.setHeader('Set-Cookie', [...(Array.isArray(existing) ? existing : [existing]), value]);
};

const createCsrfToken = () => crypto.randomBytes(32).toString('base64url');

const csrfProtection = (req, res, next) => {
  const cookies = parseCookies(req.headers.cookie || '');
  let csrfToken = cookies[CSRF_COOKIE];
  if (!csrfToken) {
    csrfToken = createCsrfToken();
    const secure = config.cookieSecure ? ' Secure;' : '';
    appendCookie(res, `${CSRF_COOKIE}=${encodeURIComponent(csrfToken)}; SameSite=Lax; Path=/; Max-Age=86400;${secure}`);
  }

  if (SAFE_METHODS.has(req.method) || !cookies.token) return next();
  const supplied = req.headers[CSRF_HEADER];
  const expectedBuffer = Buffer.from(csrfToken);
  const suppliedBuffer = Buffer.from(typeof supplied === 'string' ? supplied : '');
  if (expectedBuffer.length !== suppliedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)) {
    return res.status(403).json({ error: 'Invalid CSRF token.', code: 'CSRF_INVALID' });
  }
  return next();
};

module.exports = {
  CSRF_COOKIE,
  CSRF_HEADER,
  appendCookie,
  createCsrfToken,
  csrfProtection,
};
