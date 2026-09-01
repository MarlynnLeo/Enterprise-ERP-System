/* global beforeEach, describe, expect, jest, test */

/**
 * PermissionService.test.js
 * @description 权限服务单元测试
 */

// Mock 数据库
jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
}));

// Mock 缓存服务
jest.mock('../../src/services/cache/CacheManager', () => ({
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  deleteByPrefix: jest.fn(),
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const PermissionService = require('../../src/services/PermissionService');
const { pool } = require('../../src/config/db');
const cacheService = require('../../src/services/cache/CacheManager');

describe('PermissionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isAdmin', () => {
    test('应正确判断管理员用户', async () => {
      pool.execute.mockResolvedValueOnce([[{ count: 1 }]]);
      const result = await PermissionService.isAdmin(1);
      expect(result).toBe(true);
      expect(pool.execute).toHaveBeenCalledWith(
        expect.stringContaining('r.is_super_admin = 1'),
        [1]
      );
    });

    test('应正确判断非管理员用户', async () => {
      pool.execute.mockResolvedValueOnce([[{ count: 0 }]]);
      const result = await PermissionService.isAdmin(2);
      expect(result).toBe(false);
    });

    // 回归：曾用 `OR LOWER(r.code) IN ('admin','super_admin','system_admin')` 兜底，
    // 使角色管理员可通过新建/改名角色编码自助提权，并让 is_super_admin=0 的
    // system_admin 实际拿到 '*'。授权只允许认受保护标记。
    test('不得按角色 code 判定超管（防改名提权）', async () => {
      pool.execute.mockResolvedValueOnce([[{ count: 0 }]]);
      await PermissionService.isAdmin(3);

      const [sql] = pool.execute.mock.calls[0];
      expect(sql).toContain('r.is_super_admin = 1');
      expect(sql).not.toMatch(/r\.code/i);
      expect(sql).not.toMatch(/super_admin'/);
      expect(sql).not.toMatch(/system_admin/);
    });
  });

  describe('getUserPermissions', () => {
    test('应从缓存返回权限（命中时）', async () => {
      cacheService.get.mockResolvedValueOnce(['system:users', 'system:roles']);
      const result = await PermissionService.getUserPermissions(1);
      expect(result).toEqual(['system:users', 'system:roles']);
      expect(pool.execute).not.toHaveBeenCalled();
    });

    test('缓存未命中时应查询数据库（role_permissions SSOT）', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      // isAdmin 查询
      pool.execute.mockResolvedValueOnce([[{ count: 0 }]]);
      // getUserRolePermissions - 获取角色
      pool.execute.mockResolvedValueOnce([[{ id: 2, code: 'editor', name: '编辑' }]]);
      // 从 role_permissions → permissions 获取权限
      pool.execute.mockResolvedValueOnce([
        [{ permission: 'basedata:materials:view' }, { permission: 'basedata:materials:create' }],
      ]);

      const result = await PermissionService.getUserPermissions(5);
      expect(result).toContain('basedata:materials:view');
      expect(result).toContain('basedata:materials:create');
      expect(cacheService.set).toHaveBeenCalled();
      // 确认走了 permissions / role_permissions SQL
      const permSql = pool.execute.mock.calls.find(
        (c) => typeof c[0] === 'string' && c[0].includes('role_permissions')
      );
      expect(permSql).toBeTruthy();
    });

    test('管理员应返回通配符权限', async () => {
      cacheService.get.mockResolvedValueOnce(null);
      pool.execute.mockResolvedValueOnce([[{ count: 1 }]]);

      const result = await PermissionService.getUserPermissions(1);
      expect(result).toEqual(['*']);
    });

    test('强制刷新时不应读缓存', async () => {
      pool.execute.mockResolvedValueOnce([[{ count: 1 }]]);

      await PermissionService.getUserPermissions(1, true);
      expect(cacheService.get).not.toHaveBeenCalled();
    });
  });

  describe('getUserRolePermissions', () => {
    test('无角色的用户应返回空权限', async () => {
      pool.execute.mockResolvedValueOnce([[]]);
      const result = await PermissionService.getUserRolePermissions(99);
      expect(result).toEqual([]);
    });

    test('应展开权限别名', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 2, code: 'worker', name: '工人' }]]);
      pool.execute.mockResolvedValueOnce([[{ permission: 'basedata:bom:view' }]]);

      const result = await PermissionService.getUserRolePermissions(10);
      // 'basedata:bom' -> 'basedata:boms' 别名展开
      expect(result).toContain('basedata:bom:view');
      expect(result).toContain('basedata:boms:view');
    });

    test('role_permissions 为空时必须保持零权限，不得回退 role_menus', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 2, code: 'worker', name: '工人' }]]);
      pool.execute.mockResolvedValueOnce([[]]);

      const result = await PermissionService.getUserRolePermissions(10);

      expect(result).toEqual([]);
      expect(pool.execute).toHaveBeenCalledTimes(2);
      expect(pool.execute.mock.calls.some(([sql]) => /role_menus/.test(sql))).toBe(false);
    });

    test('权限 SSOT 表缺失时必须传播错误，不得兼容旧菜单表', async () => {
      const missingTable = Object.assign(new Error('missing role_permissions'), {
        code: 'ER_NO_SUCH_TABLE',
      });
      pool.execute.mockResolvedValueOnce([[{ id: 2, code: 'worker', name: '工人' }]]);
      pool.execute.mockRejectedValueOnce(missingTable);

      await expect(PermissionService.getUserRolePermissions(10)).rejects.toBe(missingTable);
      expect(pool.execute).toHaveBeenCalledTimes(2);
    });

    test('getAllSystemPermissions 优先读 permissions 表', async () => {
      pool.execute.mockResolvedValueOnce([
        [{ code: 'sales:orders:view' }, { code: 'finance:ar:view' }],
      ]);
      const list = await PermissionService.getAllSystemPermissions();
      expect(list).toEqual(['sales:orders:view', 'finance:ar:view']);
      expect(pool.execute.mock.calls[0][0]).toContain('FROM permissions');
    });

    test('permissions 注册表缺失时必须传播错误', async () => {
      const missingTable = Object.assign(new Error('missing permissions'), {
        code: 'ER_NO_SUCH_TABLE',
      });
      pool.execute.mockRejectedValueOnce(missingTable);

      await expect(PermissionService.getAllSystemPermissions()).rejects.toBe(missingTable);
      expect(pool.execute).toHaveBeenCalledTimes(1);
    });

    test('should expand legacy print permissions to canonical print permissions', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 3, code: 'print_user', name: 'Print User' }]]);
      pool.execute.mockResolvedValueOnce([
        [
          { permission: 'system:print:add' },
          { permission: 'system:print:edit' },
          { permission: 'system:print:template:delete' },
        ],
      ]);

      const result = await PermissionService.getUserRolePermissions(11);

      expect(result).toContain('system:print:add');
      expect(result).toContain('system:print:edit');
      expect(result).toContain('system:print:template:delete');
      expect(result).toContain('system:print:create');
      expect(result).toContain('system:print:update');
      expect(result).toContain('system:print:delete');
    });

    test('system:users 与 system:users:view 互通展开（同资源粗/细粒度）', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 4, code: 'hr', name: 'HR' }]]);
      pool.execute.mockResolvedValueOnce([[{ permission: 'system:users:view' }]]);

      const result = await PermissionService.getUserRolePermissions(12);
      expect(result).toContain('system:users:view');
      expect(result).toContain('system:users');
      // 协同选人是按钮级权限，不能由用户查看权反向获得（跨资源提权）
      expect(result).not.toContain('todo:collaborate');
    });

    test('todo:collaborate 单向蕴含用户查看权，但不反向', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 5, code: 'planner', name: '计划员' }]]);
      pool.execute.mockResolvedValueOnce([[{ permission: 'todo:collaborate' }]]);

      const result = await PermissionService.getUserRolePermissions(13);
      expect(result).toContain('todo:collaborate');
      expect(result).toContain('system:users:view');
    });
  });

  describe('clearUserPermissionsCache', () => {
    test('应清除指定用户缓存', async () => {
      await PermissionService.clearUserPermissionsCache(5);
      expect(cacheService.delete).toHaveBeenCalledWith('user_permissions:5');
    });

    test('无参数时应清除所有用户缓存', async () => {
      cacheService.deleteByPrefix.mockResolvedValueOnce(10);
      await PermissionService.clearUserPermissionsCache();
      expect(cacheService.deleteByPrefix).toHaveBeenCalledWith('user_permissions:');
    });
  });

  describe('expandPermissionsWithAliases', () => {
    test('来料检验查看码展开为检验单查看，且不串到成品创建', () => {
      const expanded = PermissionService.expandPermissionsWithAliases([
        'quality:incoming',
        'quality:incoming:view',
        'quality:incoming:create',
      ]);
      expect(expanded).toEqual(
        expect.arrayContaining([
          'quality:incoming',
          'quality:incoming:view',
          'quality:incoming:create',
          'quality:inspections',
          'quality:inspections:view',
          'quality:inspections:create',
        ])
      );
      expect(expanded).not.toContain('quality:final:create');
      expect(expanded).not.toContain('quality:process:create');
    });

    // 回归：双向展开曾让「改」自动获得「删/作废」。
    test('AP 修改权不得反向获得删除/作废权', () => {
      const expanded = PermissionService.expandPermissionsWithAliases(['finance:ap:update']);
      expect(expanded).toContain('finance:ap:invoices:update');
      expect(expanded).not.toContain('finance:ap:invoices:delete');
      expect(expanded).not.toContain('finance:payments:void');
    });

    test('AP 查看权不得反向获得付款打印权', () => {
      const expanded = PermissionService.expandPermissionsWithAliases(['finance:ap:view']);
      expect(expanded).not.toContain('finance:payments:print');
    });

    // 结构性护栏：任何双向别名都不得把低危动作放大成高危动作。
    // 新增映射若违反此约束，会在这里失败，而不是等到线上越权。
    test('双向别名不得放大动作等级', () => {
      const DESTRUCTIVE = /:(delete|void|approve|pay|cancel|reverse)$/;
      const SAFE = /:(view|read|list|print|export)$/;
      const probes = [
        'finance:ap:view',
        'finance:ap:update',
        'finance:ap:create',
        'system:users:view',
        'system:departments:view',
        'system:roles:view',
        'quality:inspections:view',
        'production:equipment:view',
        'sales:returns',
        'basedata:bom',
      ];

      for (const probe of probes) {
        const gained = PermissionService.expandPermissionsWithAliases([probe]).filter(
          (code) => code !== probe
        );
        const escalated = gained.filter((code) => DESTRUCTIVE.test(code));
        expect(escalated).toEqual([]);

        if (SAFE.test(probe)) {
          // 只读码不得展开出任何写动作
          const writes = gained.filter((code) => /:(create|update|delete)$/.test(code));
          expect(writes).toEqual([]);
        }
      }
    });
  });
});
