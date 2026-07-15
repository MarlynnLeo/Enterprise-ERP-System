/**
 * PermissionChangeService 单元测试
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../src/services/AuditService', () => ({
  AuditService: {
    log: jest.fn().mockResolvedValue(undefined),
    logFromRequest: jest.fn().mockResolvedValue(undefined),
  },
  AuditAction: {
    UPDATE: 'update',
    PERMISSION_ASSIGN: 'permission_assign',
    ROLE_ASSIGN: 'role_assign',
  },
  AuditModule: { SYSTEM: 'system' },
}));

const { pool } = require('../../src/config/db');
const { AuditService } = require('../../src/services/AuditService');
const PermissionChangeService = require('../../src/services/PermissionChangeService');

describe('PermissionChangeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('diffIds 计算 added/removed', () => {
    const d = PermissionChangeService.diffIds([1, 2, 3], [2, 3, 4]);
    expect(d.added).toEqual([4]);
    expect(d.removed).toEqual([1]);
  });

  test('resolveMenuPermissions 聚合 permission 码', async () => {
    pool.execute.mockResolvedValueOnce([
      [
        { id: 1, permission: 'sales:orders:view', name: '订单', type: 1 },
        { id: 2, permission: 'sales:orders:view', name: '查看', type: 2 },
        { id: 3, permission: 'sales:orders:create', name: '新建', type: 2 },
      ],
    ]);
    const r = await PermissionChangeService.resolveMenuPermissions([1, 2, 3]);
    expect(r.permissions).toEqual(['sales:orders:create', 'sales:orders:view']);
    expect(r.menuIds).toEqual([1, 2, 3]);
  });

  test('auditRoleMenus 写入 permission_assign 审计', async () => {
    pool.execute
      .mockResolvedValueOnce([
        [{ id: 1, permission: 'a:view', name: 'A', type: 1 }],
      ])
      .mockResolvedValueOnce([
        [
          { id: 1, permission: 'a:view', name: 'A', type: 1 },
          { id: 2, permission: 'a:create', name: '新建', type: 2 },
        ],
      ]);

    const req = { user: { id: 9, username: 'admin' }, ip: '127.0.0.1', headers: {} };
    await PermissionChangeService.auditRoleMenus(req, 5, [1], [1, 2], { roleName: '销售' });

    expect(AuditService.logFromRequest).toHaveBeenCalledWith(
      req,
      'system',
      'permission_assign',
      'role_permissions',
      '5',
      expect.objectContaining({ permissions: ['a:view'] }),
      expect.objectContaining({
        permissions: ['a:create', 'a:view'],
        permissionDiff: { added: ['a:create'], removed: [] },
      })
    );
  });

  test('auditUserRoles 写入 role_assign', async () => {
    const req = { user: { id: 1, username: 'admin' }, headers: {} };
    await PermissionChangeService.auditUserRoles(req, 10, [2], [2, 3], { username: 'bob' });
    expect(AuditService.logFromRequest).toHaveBeenCalledWith(
      req,
      'system',
      'role_assign',
      'user_roles',
      '10',
      expect.objectContaining({ roleIds: [2] }),
      expect.objectContaining({ roleIds: [2, 3] })
    );
  });
});
