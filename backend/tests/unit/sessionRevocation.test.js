/* global describe, expect, jest, test, beforeEach */

const mockConnection = {
  beginTransaction: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
  execute: jest.fn(),
};

jest.mock('../../src/config/db', () => ({
  pool: {
    getConnection: jest.fn(async () => mockConnection),
  },
}));

jest.mock('../../src/socket', () => ({
  disconnectUserSockets: jest.fn(),
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const { disconnectUserSockets } = require('../../src/socket');
const {
  revokeRoleSessions,
  revokeRoleSessionsInTransaction,
} = require('../../src/utils/sessionRevocation');

describe('sessionRevocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    mockConnection.release.mockReturnValue(undefined);
  });

  test('多个角色命中同一用户时 token_version 只递增一次', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ user_id: 7 }, { user_id: 7 }, { user_id: 8 }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    await expect(revokeRoleSessionsInTransaction(mockConnection, [3, 4, 4])).resolves.toEqual([7, 8]);

    expect(mockConnection.execute).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('SELECT DISTINCT user_id'),
      [3, 4]
    );
    expect(mockConnection.execute).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE id IN (?,?)'),
      [7, 8]
    );
  });

  test('token_version 更新失败时回滚且不提前断开 Socket', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ user_id: 7 }]])
      .mockRejectedValueOnce(new Error('update failed'));

    await expect(revokeRoleSessions([3])).rejects.toThrow('update failed');

    expect(mockConnection.commit).not.toHaveBeenCalled();
    expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    expect(disconnectUserSockets).not.toHaveBeenCalled();
  });

  test('提交成功后才断开所有受影响用户会话', async () => {
    mockConnection.execute
      .mockResolvedValueOnce([[{ user_id: 7 }, { user_id: 8 }]])
      .mockResolvedValueOnce([{ affectedRows: 2 }]);

    await expect(revokeRoleSessions([3], 'permission_changed')).resolves.toBe(2);

    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(disconnectUserSockets).toHaveBeenNthCalledWith(1, 7, 'permission_changed');
    expect(disconnectUserSockets).toHaveBeenNthCalledWith(2, 8, 'permission_changed');
  });
});
