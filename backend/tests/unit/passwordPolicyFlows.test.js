/* global afterEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(),
    execute: jest.fn(),
  },
}));

const { pool } = require('../../src/config/db');
const systemModel = require('../../src/models/system');

describe('password policy enforcement in administrator reset flow', () => {
  afterEach(() => {
    pool.getConnection.mockReset();
    pool.execute.mockReset();
  });

  test('rejects a weak reset before opening a database transaction', async () => {
    await expect(systemModel.resetUserPassword(9, 'short')).rejects.toThrow('密码不符合安全要求');
    expect(pool.getConnection).not.toHaveBeenCalled();
  });
});
