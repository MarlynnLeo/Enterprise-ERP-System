/* global afterEach, describe, expect, jest, test */

const originalNodeEnv = process.env.NODE_ENV;
const originalCookieSecure = process.env.COOKIE_SECURE;

const restoreEnv = (key, value) => {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
};

const {
  csrfProtection,
  ensureCsrfSessionCookie,
  generateCsrfToken,
  getSessionIdentifier,
} = require('../../src/middleware/csrfEnhanced');

afterEach(() => {
  restoreEnv('NODE_ENV', originalNodeEnv);
  restoreEnv('COOKIE_SECURE', originalCookieSecure);
});

describe('stable CSRF session identifier', () => {
  test('survives login and access-token rotation', () => {
    process.env.NODE_ENV = 'test';
    process.env.COOKIE_SECURE = 'false';
    const req = { protocol: 'http', ip: '127.0.0.1', cookies: {} };
    const res = { cookie: jest.fn() };

    ensureCsrfSessionCookie(req, res);
    const firstIdentifier = getSessionIdentifier(req);
    expect(firstIdentifier).toMatch(/^csrf:[a-f0-9]{64}$/);
    expect(res.cookie).toHaveBeenCalledTimes(1);

    req.cookies.accessToken = 'rotated-access-token';
    req.cookies.refreshToken = 'rotated-refresh-token';
    ensureCsrfSessionCookie(req, res);

    expect(getSessionIdentifier(req)).toBe(firstIdentifier);
    expect(res.cookie).toHaveBeenCalledTimes(1);
  });

  test('uses isolated secure and insecure cookie variants', () => {
    process.env.NODE_ENV = 'test';
    process.env.COOKIE_SECURE = 'auto';
    const req = { protocol: 'https', ip: '127.0.0.1', cookies: {} };
    const res = { cookie: jest.fn() };

    ensureCsrfSessionCookie(req, res);

    expect(res.cookie.mock.calls[0][0]).toBe('__Host-erp-csrf-session');
    expect(res.cookie.mock.calls[0][2]).toEqual(
      expect.objectContaining({ secure: true, httpOnly: true, path: '/' })
    );
  });

  test('accepts a token generated before authentication after the access token rotates', () => {
    process.env.NODE_ENV = 'test';
    process.env.COOKIE_SECURE = 'false';
    const tokenRequest = { protocol: 'http', ip: '127.0.0.1', cookies: {} };
    const tokenResponse = { cookie: jest.fn() };
    const token = generateCsrfToken(tokenRequest, tokenResponse);
    const csrfCookie = tokenResponse.cookie.mock.calls.find(
      ([name]) => name === 'psifi.x-csrf-token'
    );

    const writeRequest = {
      method: 'PUT',
      protocol: 'http',
      ip: '127.0.0.1',
      cookies: {
        ...tokenRequest.cookies,
        'psifi.x-csrf-token': csrfCookie[1],
        accessToken: 'new-access-token',
      },
      headers: { 'x-csrf-token': token },
      body: {},
    };
    const next = jest.fn();

    csrfProtection(writeRequest, { cookie: jest.fn() }, next);

    expect(next).toHaveBeenCalledWith();
  });
});
