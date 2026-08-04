jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/NotificationRecipientService', () => ({
  getUserIdsByPermissions: jest.fn(),
  filterActiveUserIds: jest.fn(async (ids) => [...new Set(ids)]),
}));

const NotificationService = require('../../src/services/NotificationService');
const RecipientService = require('../../src/services/NotificationRecipientService');
const { pool } = require('../../src/config/db');

describe('NotificationService routing safeguards', () => {
  beforeEach(() => jest.clearAllMocks());

  test('按权限发送默认不追加管理员，也不回退管理员', async () => {
    RecipientService.getUserIdsByPermissions.mockResolvedValueOnce([]);

    const result = await NotificationService.notifyByPermissions(
      ['finance:ar:view'],
      { title: '测试通知' }
    );

    expect(RecipientService.getUserIdsByPermissions).toHaveBeenCalledWith(
      ['finance:ar:view'],
      { includeAdmins: false }
    );
    expect(result.inserted).toBe(0);
    expect(RecipientService.getUserIdsByPermissions).toHaveBeenCalledTimes(1);
  });

  test('直接发送会过滤停用用户，并返回实际新插入用户', async () => {
    RecipientService.filterActiveUserIds.mockResolvedValueOnce([2]);
    pool.query.mockResolvedValueOnce([[]]);
    pool.query.mockResolvedValueOnce([{ affectedRows: 1 }]);

    const result = await NotificationService.notifyUsers([2, 3], {
      title: '测试通知',
      content: '内容',
    });

    expect(RecipientService.filterActiveUserIds).toHaveBeenCalledWith([2, 3]);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.insertedUserIds).toEqual([2]);
  });
});
