/* global describe, expect, jest, test */

jest.mock('../../src/config/cors', () => ({
  isOriginAllowed: jest.fn((origin) => origin === 'https://erp.example.com'),
}));

const { isTrustedAuthRequest } = require('../../src/middleware/csrfEnhanced');

const request = (headers = {}, bodyType = 'application/json') => ({
  get: (name) => headers[name] || headers[name.toLowerCase()],
  is: () => bodyType,
});

describe('CSRF auth origin guard', () => {
  test('accepts configured origin', () => {
    expect(isTrustedAuthRequest(request({ Origin: 'https://erp.example.com' }))).toBe(true);
  });

  test('rejects cross-site fetch metadata', () => {
    expect(
      isTrustedAuthRequest(
        request({ Origin: 'https://erp.example.com', 'Sec-Fetch-Site': 'cross-site' })
      )
    ).toBe(false);
  });

  test('allows origin-less JSON API clients but not form posts', () => {
    expect(isTrustedAuthRequest(request({}, 'application/json'))).toBe(true);
    expect(isTrustedAuthRequest(request({}, 'application/x-www-form-urlencoded'))).toBe(false);
  });
});
