/**
 * Multi-tab refresh rotation grace window.
 */

jest.mock('../../src/config/db', () => {
  const connection = {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(),
  };
  return {
    pool: {
      getConnection: jest.fn().mockResolvedValue(connection),
      execute: jest.fn(),
      __connection: connection,
    },
  };
});

const { pool } = require('../../src/config/db');
const RefreshTokenService = require('../../src/services/auth/RefreshTokenService');

describe('RefreshTokenService multi-tab grace', () => {
  const conn = pool.__connection;

  beforeEach(() => {
    jest.clearAllMocks();
    RefreshTokenService._clearGraceCacheForTests();
    pool.getConnection.mockResolvedValue(conn);
  });

  test('second concurrent rotate returns grace pair instead of REUSED', async () => {
    // First rotate: UPDATE succeeds + register INSERT
    conn.execute
      .mockResolvedValueOnce([{ affectedRows: 1 }]) // UPDATE mark used
      .mockResolvedValueOnce([{ affectedRows: 1 }]); // INSERT new token

    const first = await RefreshTokenService.rotate({
      userId: 1,
      oldJti: 'jti-old',
      oldFamilyId: 'fam-1',
      oldToken: 'refresh-old',
      newJti: 'jti-new',
      newFamilyId: 'fam-1',
      newToken: 'refresh-new',
      newAccessToken: 'access-new',
      expiresAt: new Date(Date.now() + 86400000),
    });
    expect(first).toEqual({ status: 'rotated' });

    // Second rotate with same old token: UPDATE affects 0, grace cache hits
    conn.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);

    const second = await RefreshTokenService.rotate({
      userId: 1,
      oldJti: 'jti-old',
      oldFamilyId: 'fam-1',
      oldToken: 'refresh-old',
      newJti: 'jti-other',
      newFamilyId: 'fam-1',
      newToken: 'refresh-other',
      newAccessToken: 'access-other',
      expiresAt: new Date(Date.now() + 86400000),
    });

    expect(second).toEqual({
      status: 'grace',
      accessToken: 'access-new',
      refreshToken: 'refresh-new',
      refreshJti: 'jti-new',
      refreshFamilyId: 'fam-1',
    });
    // Must not bump token_version / revoke family on grace path
    const sql = conn.execute.mock.calls.map((c) => String(c[0])).join('\n');
    expect(sql).not.toMatch(/token_version/);
    expect(sql).not.toMatch(/refresh_token_reuse/);
  });
});
