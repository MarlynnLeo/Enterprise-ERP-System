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

  test('allows requests without Origin in production when CORS is otherwise configured', () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_ORIGINS = 'https://erp.example.com';

    expect(isOriginAllowed(undefined)).toBe(true);
    expect(isOriginAllowed('https://erp.example.com')).toBe(true);
    expect(isOriginAllowed('https://evil.example.com')).toBe(false);
  });
});
