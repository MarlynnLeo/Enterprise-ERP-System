/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

jest.mock('../../src/utils/avatarUrl', () => ({
  normalizeAvatarUrl: jest.fn((value) => value),
}));

const { pool } = require('../../src/config/db');
const { normalizeAvatarUrl } = require('../../src/utils/avatarUrl');
const AuthService = require('../../src/services/auth/AuthService');

describe('AuthService self-service profile security', () => {
  afterEach(() => {
    pool.execute.mockReset();
    normalizeAvatarUrl.mockReset();
    normalizeAvatarUrl.mockImplementation((value) => value);
  });

  test('rejects authorization attributes in the service layer', async () => {
    await expect(
      AuthService.updateUserProfile(7, {
        real_name: 'Safe Name',
        department_id: 999,
      })
    ).rejects.toMatchObject({ code: 'PROFILE_FIELD_FORBIDDEN' });

    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('persists only the explicit self-service fields', async () => {
    pool.execute.mockResolvedValueOnce([{ affectedRows: 1 }]);

    await expect(
      AuthService.updateUserProfile(7, {
        real_name: 'Safe Name',
        phone: '13800000000',
      })
    ).resolves.toBe(true);

    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).not.toContain('department_id');
    expect(sql).not.toContain('position');
    expect(params).toEqual(['Safe Name', '13800000000', 7]);
  });

  test('rejects an update containing only authorization attributes', async () => {
    await expect(AuthService.updateUserProfile(7, { department_id: 999 })).rejects.toMatchObject({
      code: 'PROFILE_FIELD_FORBIDDEN',
    });

    expect(pool.execute).not.toHaveBeenCalled();
  });

  test('does not return a stale local avatar in the user profile', async () => {
    pool.execute.mockResolvedValueOnce([
      [
        {
          id: 7,
          username: 'quality.user',
          real_name: 'Quality User',
          avatar: '/uploads/avatars/missing.jpg',
        },
      ],
    ]);
    normalizeAvatarUrl.mockReturnValueOnce(null);

    const user = await AuthService.getUserProfile(7);

    expect(user.avatar).toBeNull();
    expect(normalizeAvatarUrl).toHaveBeenCalledWith('/uploads/avatars/missing.jpg');
  });
});
