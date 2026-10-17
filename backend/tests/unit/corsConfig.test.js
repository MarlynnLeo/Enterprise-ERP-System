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

  describe.each(['production', 'development'])('%s private network origins', (environment) => {
    beforeEach(() => {
      process.env.NODE_ENV = environment;
      process.env.ALLOWED_ORIGINS = 'https://erp.example.com';
    });

    test.each([
      'http://192.168.1.251:18081',
      'https://10.0.0.2',
      'http://172.16.0.1:8080',
      'http://172.31.255.254',
      'http://127.0.0.1:5173',
      'http://localhost:5173',
    ])('preserves valid LAN and local origins: %s', (origin) => {
      expect(isOriginAllowed(origin)).toBe(true);
    });

    test.each([
      'https://192.168.evil.example',
      'https://10.attacker.example',
      'https://172.16.attacker.example',
      'https://192.168.1.1.attacker.example',
      'https://192.168.1.1@attacker.example',
      'https://user@192.168.1.1',
      'https://192.168.1.1/path',
      'https://192.168.1.1?query=1',
      'https://192.168.1.1#fragment',
      'https://192.168.999.1',
      'http://172.15.0.1',
      'http://172.32.0.1',
      'http://11.0.0.1',
      'null',
    ])('rejects spoofed and invalid origins: %s', (origin) => {
      expect(isOriginAllowed(origin)).toBe(false);
    });
  });
});
