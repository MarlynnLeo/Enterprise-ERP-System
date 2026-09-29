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
const proxyaddr = require('proxy-addr');

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

  test('resolves the client behind an explicitly trusted proxy', () => {
    const trustProxy = proxyaddr.compile(['172.20.0.0/16']);
    expect(
      getSocketConnectionKey(
        {
          headers: { 'x-forwarded-for': '203.0.113.99' },
          socket: { remoteAddress: '172.20.0.8' },
        },
        trustProxy
      )
    ).toBe('203.0.113.99');
  });

  test('stops at the first untrusted hop, ignoring a forged prefix', () => {
    const trustProxy = proxyaddr.compile(['172.20.0.0/16']);
    expect(
      getSocketConnectionKey(
        {
          headers: { 'x-forwarded-for': '192.0.2.1, 203.0.113.99' },
          socket: { remoteAddress: '172.20.0.8' },
        },
        trustProxy
      )
    ).toBe('203.0.113.99');
  });

  test('a direct untrusted client cannot opt into another quota', () => {
    const trustProxy = proxyaddr.compile(['172.20.0.0/16']);
    expect(
      getSocketConnectionKey(
        {
          headers: { 'x-forwarded-for': '203.0.113.99' },
          socket: { remoteAddress: '192.0.2.5' },
        },
        trustProxy
      )
    ).toBe('192.0.2.5');
  });

  test('an invalid forwarded address cannot create arbitrary quota keys', () => {
    expect(
      getSocketConnectionKey(
        {
          headers: { 'x-forwarded-for': 'not-an-ip' },
          socket: { remoteAddress: '172.20.0.8' },
        },
        proxyaddr.compile(['172.20.0.0/16'])
      )
    ).toBe('172.20.0.8');
  });
});
