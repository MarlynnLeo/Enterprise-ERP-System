/* global afterEach, describe, expect, test */

const { isOriginAllowed } = require('../../src/config/cors');

const originalNodeEnv = process.env.NODE_ENV;
const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

describe('cors config', () => {
  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalAllowedOrigins === undefined) {
      delete process.env.ALLOWED_ORIGINS;
    } else {
      process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
    }
  });

  test('allows same-origin requests without Origin but rejects unknown production origins', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://erp.example.com';

    // 审计加固：生产环境拒绝无 Origin 的跨域请求，防止 CORS 绕过
    // Same-origin and health-check requests do not carry Origin; explicit
    // origins still must be present in the production allow-list.
    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed('https://erp.example.com')).toBe(true);
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });

  test('allows requests without Origin in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_ORIGINS = 'https://erp.example.com';

    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed('https://erp.example.com')).toBe(true);
    expect(isOriginAllowed('http://localhost:3000')).toBe(true);
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });

  test('rejects all origins in production when ALLOWED_ORIGINS not set', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;

    expect(isOriginAllowed(undefined)).toBe(false);
    expect(isOriginAllowed('https://any.example.com')).toBe(false);
  });
});
