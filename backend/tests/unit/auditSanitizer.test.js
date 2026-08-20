/* global describe, expect, test */

const {
  sanitizeAuditValue,
  serializeAuditPayload,
} = require('../../src/utils/auditSanitizer');

describe('auditSanitizer', () => {
  test('递归脱敏密码、Token、Cookie 和密钥字段', () => {
    const sanitized = sanitizeAuditValue({
      password: 'secret',
      nested: {
        refreshToken: 'token',
        headers: { cookie: 'session=x', authorization: 'Bearer x' },
        api_key: 'key',
        safe: 'visible',
      },
    });

    expect(sanitized).toEqual({
      password: '***REDACTED***',
      nested: {
        refreshToken: '***REDACTED***',
        headers: {
          cookie: '***REDACTED***',
          authorization: '***REDACTED***',
        },
        api_key: '***REDACTED***',
        safe: 'visible',
      },
    });
  });

  test('循环对象和超大载荷安全截断', () => {
    const value = { text: 'x'.repeat(10_000) };
    value.self = value;
    const serialized = serializeAuditPayload(value, { maxJsonBytes: 1024, maxStringLength: 8000 });
    const parsed = JSON.parse(serialized);

    expect(parsed._truncated).toBe(true);
    expect(parsed.original_bytes).toBeGreaterThan(1024);
  });
});
