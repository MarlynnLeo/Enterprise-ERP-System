/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
  },
}));

const { pool } = require('../../src/config/db');
const AuthService = require('../../src/services/auth/AuthService');

describe('AuthService self-service profile security', () => {
  afterEach(() => {
    pool.execute.mockReset();
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
    await expect(
      AuthService.updateUserProfile(7, { department_id: 999 })
    ).rejects.toMatchObject({ code: 'PROFILE_FIELD_FORBIDDEN' });

    expect(pool.execute).not.toHaveBeenCalled();
  });
});
