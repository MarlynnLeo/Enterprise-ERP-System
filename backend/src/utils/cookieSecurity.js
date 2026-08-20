const VALID_SECURE_MODES = new Set(['true', 'false', 'auto']);
const VALID_SAME_SITE_VALUES = new Set(['strict', 'lax', 'none']);

const AUTH_COOKIE_NAMES = Object.freeze(['accessToken', 'refreshToken']);
const CSRF_COOKIE_NAMES = Object.freeze({
  secure: '__Host-psifi.x-csrf-token',
  insecure: 'psifi.x-csrf-token',
});

const getCookieSecureMode = () => {
  const configured = String(process.env.COOKIE_SECURE || '')
    .trim()
    .toLowerCase();

  if (process.env.NODE_ENV === 'production') {
    // The installation has two supported entry points: the public HTTPS
    // tunnel and the internal HTTP address. `auto` uses the protocol supplied
    // by the trusted reverse-proxy chain, while `true` remains available for
    // HTTPS-only deployments. Never allow an explicit insecure production
    // mode.
    if (configured === 'auto' || configured === 'true') return configured;
    throw new Error('COOKIE_SECURE=auto or COOKIE_SECURE=true is required in production');
  }

  if (VALID_SECURE_MODES.has(configured)) return configured;

  return process.env.NODE_ENV === 'production' ? 'true' : 'false';
};

const getForwardedProtocol = (req) => {
  const headerValue =
    typeof req?.get === 'function'
      ? req.get('X-Forwarded-Proto')
      : req?.headers?.['x-forwarded-proto'];

  return String(headerValue || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
};

const isHttpsRequest = (req) => {
  return Boolean(req?.secure) || req?.protocol === 'https' || getForwardedProtocol(req) === 'https';
};

const shouldUseSecureCookies = (req) => {
  const mode = getCookieSecureMode();
  if (mode === 'true') return true;
  if (mode === 'false') return false;
  return isHttpsRequest(req);
};

const getCookieSameSite = () => {
  const configured = String(process.env.COOKIE_SAME_SITE || '')
    .trim()
    .toLowerCase();

  if (VALID_SAME_SITE_VALUES.has(configured)) {
    return configured;
  }

  // Mixed HTTP/HTTPS entry points (internal + public) need Lax so browser
  // cookie sessions remain usable after top-level navigations.
  return 'lax';
};

const buildAuthCookieOptions = (req, overrides = {}) => {
  const secure = shouldUseSecureCookies(req);
  const sameSite = getCookieSameSite();

  // SameSite=None always requires Secure.
  const normalizedSameSite = sameSite === 'none' && !secure ? 'lax' : sameSite;

  return {
    httpOnly: true,
    secure,
    sameSite: normalizedSameSite,
    path: '/',
    ...overrides,
  };
};

const clearCookieVariants = (res, cookieName, baseOptions = {}) => {
  if (!res || typeof res.clearCookie !== 'function') return;

  const optionSets = [
    { ...baseOptions, path: baseOptions.path || '/', secure: false },
    { ...baseOptions, path: baseOptions.path || '/', secure: true },
  ];

  for (const options of optionSets) {
    res.clearCookie(cookieName, options);
  }
};

const clearAuthCookies = (res) => {
  for (const cookieName of AUTH_COOKIE_NAMES) {
    clearCookieVariants(res, cookieName, {
      httpOnly: true,
      path: '/',
      sameSite: getCookieSameSite(),
    });
  }
};

const clearCsrfCookies = (res) => {
  clearCookieVariants(res, CSRF_COOKIE_NAMES.insecure, {
    httpOnly: true,
    path: '/',
    sameSite: getCookieSameSite(),
  });
  // __Host- cookies require Secure + Path=/ and no Domain attribute.
  clearCookieVariants(res, CSRF_COOKIE_NAMES.secure, {
    httpOnly: true,
    path: '/',
    sameSite: getCookieSameSite(),
    secure: true,
  });
};

const getCsrfCookieName = (req) =>
  shouldUseSecureCookies(req) ? CSRF_COOKIE_NAMES.secure : CSRF_COOKIE_NAMES.insecure;

module.exports = {
  AUTH_COOKIE_NAMES,
  CSRF_COOKIE_NAMES,
  getCookieSecureMode,
  getCookieSameSite,
  getCsrfCookieName,
  isHttpsRequest,
  shouldUseSecureCookies,
  buildAuthCookieOptions,
  clearCookieVariants,
  clearAuthCookies,
  clearCsrfCookies,
};
