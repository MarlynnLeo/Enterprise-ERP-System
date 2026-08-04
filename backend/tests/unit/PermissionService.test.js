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
      pool.execute.mockResolvedValueOnce([[
        { permission: 'basedata:materials:view' },
        { permission: 'basedata:materials:create' },
      ]]);

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
      pool.execute.mockResolvedValueOnce([[
        { permission: 'basedata:bom:view' },
      ]]);

      const result = await PermissionService.getUserRolePermissions(10);
      // 'basedata:bom' -> 'basedata:boms' 别名展开
      expect(result).toContain('basedata:bom:view');
      expect(result).toContain('basedata:boms:view');
    });

    test('getAllSystemPermissions 优先读 permissions 表', async () => {
      pool.execute.mockResolvedValueOnce([
        [{ code: 'sales:orders:view' }, { code: 'finance:ar:view' }],
      ]);
      const list = await PermissionService.getAllSystemPermissions();
      expect(list).toEqual(['sales:orders:view', 'finance:ar:view']);
      expect(pool.execute.mock.calls[0][0]).toContain('FROM permissions');
    });

    test('should expand legacy print permissions to canonical print permissions', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 3, code: 'print_user', name: 'Print User' }]]);
      pool.execute.mockResolvedValueOnce([[
        { permission: 'system:print:add' },
        { permission: 'system:print:edit' },
        { permission: 'system:print:template:delete' },
      ]]);

      const result = await PermissionService.getUserRolePermissions(11);

      expect(result).toContain('system:print:add');
      expect(result).toContain('system:print:edit');
      expect(result).toContain('system:print:template:delete');
      expect(result).toContain('system:print:create');
      expect(result).toContain('system:print:update');
      expect(result).toContain('system:print:delete');
    });

    test('system:users 与 system:users:view / todo:collaborate 应互通展开', async () => {
      pool.execute.mockResolvedValueOnce([[{ id: 4, code: 'hr', name: 'HR' }]]);
      pool.execute.mockResolvedValueOnce([[
        { permission: 'system:users:view' },
      ]]);

      const result = await PermissionService.getUserRolePermissions(12);
      expect(result).toContain('system:users:view');
      expect(result).toContain('system:users');
      expect(result).toContain('todo:collaborate');
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
});
