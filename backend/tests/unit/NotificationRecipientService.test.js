jest.mock('../../src/config/db', () => ({
  pool: {
    query: jest.fn(),
  },
}));

jest.mock('../../src/services/PermissionService', () => ({
  expandPermissionsWithAliases: jest.fn((permissions) => permissions),
}));

jest.mock('../../src/services/system/NotificationGovernanceConfig', () => ({
  get: jest.fn().mockResolvedValue({
    broadcastBlockRatio: 0.8,
    broadcastWarningRatio: 0.5,
    minimumPopulation: 5,
    maxTargetsPerRule: 100,
    optionLimit: 1000,
    realtimeWindowMinutes: 5,
  }),
}));

const { pool } = require('../../src/config/db');
const PermissionService = require('../../src/services/PermissionService');
const service = require('../../src/services/NotificationRecipientService');

describe('NotificationRecipientService', () => {
  beforeEach(() => jest.clearAllMocks());

  test('按权限解析使用 permissions SSOT，默认不包含 admin 角色', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 7 }]]);

    await expect(service.getUserIdsByPermissions(['finance:ar:view'])).resolves.toEqual([7]);

    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain('role_permissions');
    expect(sql).toContain('permissions p');
    expect(sql).toContain('r.is_super_admin = 0');
    expect(sql).not.toContain('role_menus');
    expect(params).toEqual([['finance:ar:view'], 'finance:ar:view']);
    expect(PermissionService.expandPermissionsWithAliases).toHaveBeenCalledWith(['finance:ar:view']);
  });

  test('只有显式 includeAdmins 才会加入 admin 角色', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 1 }]]);

    await service.getUserIdsByPermissions([], { includeAdmins: true });

    const [sql] = pool.query.mock.calls[0];
    expect(sql).toContain('r.is_super_admin = 1');
  });

  test('指定用户只返回启用用户并去重', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 2 }, { id: 5 }]]);

    await expect(service.resolveRecipients('user', [5, 5, 8, 2])).resolves.toEqual([2, 5]);
    expect(pool.query.mock.calls[0][1]).toEqual([[2, 5, 8]]);
  });

  test('无效或停用的收件配置会被拒绝', async () => {
    pool.query.mockResolvedValueOnce([[{ id: 4 }]]);

    await expect(service.validateConfig('user', [4, 9])).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
  });
});
