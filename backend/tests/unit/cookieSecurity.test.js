/* global afterEach, describe, expect, jest, test */

const {
  buildAuthCookieOptions,
  clearAuthCookies,
  clearCsrfCookies,
  getCookieSameSite,
  getCookieSecureMode,
  getCsrfCookieName,
  isHttpsRequest,
  shouldUseSecureCookies,
} = require('../../src/utils/cookieSecurity');
const { clearTokenCookies, setTokensToCookies } = require('../../src/config/jwtEnhanced');

const originalNodeEnv = process.env.NODE_ENV;
const originalCookieSecure = process.env.COOKIE_SECURE;
const originalCookieSameSite = process.env.COOKIE_SAME_SITE;

const restoreEnv = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

afterEach(() => {
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('COOKIE_SECURE', originalCookieSecure);
  restoreEnv('COOKIE_SAME_SITE', originalCookieSameSite);
});

describe('cookie security policy', () => {
  test('auto mode keeps HTTPS cookies secure behind a trusted proxy', () => {
    process.env.COOKIE_SECURE = 'auto';
    const req = { headers: { 'x-forwarded-proto': 'https' } };

    expect(isHttpsRequest(req)).toBe(true);
    expect(shouldUseSecureCookies(req)).toBe(true);
    expect(getCsrfCookieName(req)).toBe('__Host-psifi.x-csrf-token');
  });

  test('auto mode allows cookies on the internal HTTP entry point', () => {
    process.env.COOKIE_SECURE = 'auto';
    const req = { protocol: 'http', headers: { 'x-forwarded-proto': 'http' } };

    expect(isHttpsRequest(req)).toBe(false);
    expect(shouldUseSecureCookies(req)).toBe(false);
    expect(getCsrfCookieName(req)).toBe('psifi.x-csrf-token');
  });

  test('explicit modes override request protocol', () => {
    process.env.COOKIE_SECURE = 'true';
    expect(shouldUseSecureCookies({ protocol: 'http' })).toBe(true);

    process.env.COOKIE_SECURE = 'false';
    expect(shouldUseSecureCookies({ protocol: 'https' })).toBe(false);
  });

  test('production fails closed when secure-cookie mode is not explicitly configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.COOKIE_SECURE;

    expect(() => getCookieSecureMode()).toThrow(/COOKIE_SECURE=true/);
    expect(() => shouldUseSecureCookies({ protocol: 'http' })).toThrow(/COOKIE_SECURE=true/);
  });

  test('default SameSite is Lax for mixed HTTP/HTTPS deployments', () => {
    delete process.env.COOKIE_SAME_SITE;
    process.env.NODE_ENV = 'production';
    expect(getCookieSameSite()).toBe('lax');
  });

  test('token cookies use the request-aware policy and clear stale variants first', () => {
    process.env.COOKIE_SECURE = 'auto';
    process.env.COOKIE_SAME_SITE = 'lax';
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };

    setTokensToCookies(
      { headers: { 'x-forwarded-proto': 'http' } },
      res,
      'access-token',
      'refresh-token'
    );

    expect(res.clearCookie).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledTimes(2);
    expect(res.cookie.mock.calls[0][2]).toEqual(
      expect.objectContaining({ httpOnly: true, secure: false, sameSite: 'lax', path: '/' })
    );
    expect(buildAuthCookieOptions({ headers: { 'x-forwarded-proto': 'https' } }).secure).toBe(true);
  });

  test('clearTokenCookies removes both secure and insecure auth/csrf variants', () => {
    const res = { clearCookie: jest.fn() };
    clearTokenCookies({}, res);

    const names = res.clearCookie.mock.calls.map((call) => call[0]);
    expect(names).toEqual(
      expect.arrayContaining([
        'accessToken',
        'refreshToken',
        'psifi.x-csrf-token',
        '__Host-psifi.x-csrf-token',
      ])
    );

    // accessToken should be cleared with both secure true and false
    const accessOptions = res.clearCookie.mock.calls
      .filter((call) => call[0] === 'accessToken')
      .map((call) => call[1].secure);
    expect(accessOptions).toEqual(expect.arrayContaining([true, false]));

    clearAuthCookies(res);
    clearCsrfCookies(res);
  });
});
