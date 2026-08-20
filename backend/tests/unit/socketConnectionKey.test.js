/* global describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { execute: jest.fn() },
}));

jest.mock('../../src/config/jwtEnhanced', () => ({
  verifyAccessToken: jest.fn(),
}));

jest.mock('../../src/services/PermissionService', () => ({
  getUserPermissions: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { getSocketConnectionKey } = require('../../src/socket');

describe('Socket connection limit key', () => {
  test('ignores a forged X-Forwarded-For header', () => {
    const request = {
      headers: { 'x-forwarded-for': '203.0.113.99' },
      socket: { remoteAddress: '172.20.0.8' },
    };

    expect(getSocketConnectionKey(request)).toBe('172.20.0.8');
  });

  test('uses a stable unknown key when no transport address exists', () => {
    expect(getSocketConnectionKey({ headers: { 'x-forwarded-for': '203.0.113.99' } })).toBe(
      'unknown'
    );
  });
});
