/**
 * PermissionRegistry 单元测试
 */

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const {
  moduleOf,
  normalizePermissionCode,
  ensurePermission,
  supplementalPermissionCodesForRole,
  syncRolePermissionsFromMenus,
  bindMenuPermission,
  grantMenuPermissionToRoles,
} = require('../../src/services/PermissionRegistry');

function mockConn(handlers) {
  return {
    execute: jest.fn(async (sql, params) => {
      for (const h of handlers) {
        if (h.match(sql, params)) return h.result;
      }
      return [[]];
    }),
  };
}

describe('PermissionRegistry', () => {
  test('moduleOf 取首段', () => {
    expect(moduleOf('finance:ar:view')).toBe('finance');
    expect(moduleOf('dashboard')).toBe('dashboard');
  });

  test('normalizePermissionCode 折叠双动作后缀', () => {
    expect(normalizePermissionCode('contract:view:view')).toBe('contract:view');
    expect(normalizePermissionCode('finance:cost:view:view')).toBe('finance:cost:view');
    expect(normalizePermissionCode('finance:budget:edit:create')).toBe('finance:budget:create');
    expect(normalizePermissionCode('finance:ap:view')).toBe('finance:ap:view');
    expect(normalizePermissionCode('production:data-view:view')).toBe('production:data-view:view');
  });

  test('bindMenuPermission 同步 permission 与 permission_id', async () => {
    const conn = mockConn([
      {
        match: (sql) => sql.includes('SELECT id FROM permissions'),
        result: [[{ id: 83 }]],
      },
      {
        match: (sql) => sql.includes('UPDATE menus SET permission'),
        result: [{ affectedRows: 1 }],
      },
    ]);
    const id = await bindMenuPermission(conn, 2265, 'contract:view:view', '查看');
    expect(id).toBe(83);
    expect(conn.execute).toHaveBeenCalledWith(
      'UPDATE menus SET permission = ?, permission_id = ? WHERE id = ?',
      ['contract:view', 83, 2265]
    );
  });

  test('ensurePermission 已存在则返回 id', async () => {
    const conn = mockConn([
      {
        match: (sql) => sql.includes('SELECT id FROM permissions'),
        result: [[{ id: 12 }]],
      },
    ]);
    const id = await ensurePermission(conn, 'sales:orders:view');
    expect(id).toBe(12);
    expect(conn.execute).toHaveBeenCalledTimes(1);
  });

  test('ensurePermission 不存在则插入', async () => {
    const conn = mockConn([
      {
        match: (sql) => sql.includes('SELECT id FROM permissions'),
        result: [[]],
      },
      {
        match: (sql) => sql.includes('INSERT INTO permissions'),
        result: [{ insertId: 99 }],
      },
    ]);
    const id = await ensurePermission(conn, 'sales:orders:create', { source: 'route' });
    expect(id).toBe(99);
  });

  test('syncRolePermissionsFromMenus 先删后插', async () => {
    const calls = [];
    const conn = {
      execute: jest.fn(async (sql, params) => {
        calls.push(sql.replace(/\s+/g, ' ').trim().slice(0, 60));
        if (sql.includes('SELECT id, code, is_super_admin FROM roles')) {
          return [[{ id: 3, code: 'custom_role', is_super_admin: 0 }]];
        }
        if (sql.includes('DELETE FROM role_permissions')) return [{ affectedRows: 2 }];
        if (sql.includes('SELECT id, permission, name FROM menus')) {
          return [[{ id: 1, permission: 'a:view', name: 'A' }]];
        }
        if (sql.includes('SELECT id FROM permissions')) return [[{ id: 7 }]];
        if (sql.includes('UPDATE menus SET permission_id')) return [{ affectedRows: 1 }];
        if (sql.includes('INSERT INTO role_permissions')) return [{ affectedRows: 1 }];
        return [[]];
      }),
    };

    const r = await syncRolePermissionsFromMenus(conn, 3, [1]);
    expect(r.inserted).toBeGreaterThan(0);
    expect(calls.some((c) => c.includes('DELETE FROM role_permissions'))).toBe(true);
    expect(calls.some((c) => c.includes('INSERT INTO role_permissions'))).toBe(true);
    const menuSelect = conn.execute.mock.calls.find(([sql]) =>
      sql.includes('SELECT id, permission, name FROM menus')
    );
    expect(menuSelect[0]).toContain('AND status = 1');
  });

  test('自定义角色即使没有菜单也保留 lookup:read 基线权限', async () => {
    const conn = mockConn([
      {
        match: (sql) => sql.includes('SELECT id, code, is_super_admin FROM roles'),
        result: [[{ id: 8, code: 'custom_role', is_super_admin: 0 }]],
      },
      {
        match: (sql) => sql.includes('SELECT id FROM permissions'),
        result: [[{ id: 51 }]],
      },
      {
        match: (sql) => sql.includes('INSERT INTO role_permissions'),
        result: [{ affectedRows: 1 }],
      },
    ]);

    const result = await syncRolePermissionsFromMenus(conn, 8, []);

    expect(result.supplemental).toBe(1);
    expect(conn.execute).toHaveBeenCalledWith('SELECT id FROM permissions WHERE code = ? LIMIT 1', [
      'lookup:read',
    ]);
  });

  test('受管岗位的补充权限统一包含公共权限与模板精确权限', () => {
    const codes = supplementalPermissionCodesForRole(
      {
        code: 'inventory_operator',
        is_super_admin: 0,
      },
      ['inventory:stock:export', 'inventory:outbound:cancel', 'system:print:view']
    );

    expect(codes).toEqual(
      expect.arrayContaining([
        'dashboard',
        'lookup:read',
        'basedata:materials:view',
        'inventory:stock:export',
      ])
    );
    expect(codes).not.toContain('inventory:outbound:cancel');
    expect(codes).not.toContain('system:print:view');
  });

  test('受管岗位会补齐注册表中符合权限前缀的无菜单动作码', () => {
    const codes = supplementalPermissionCodesForRole({ code: 'system_admin', is_super_admin: 0 }, [
      'system:print:view',
      'system:print:create',
      'inventory:stock:view',
    ]);

    expect(codes).toEqual(expect.arrayContaining(['system:print:view', 'system:print:create']));
    expect(codes).not.toContain('inventory:stock:view');
  });

  test('超级管理员同步为全部启用权限', async () => {
    const conn = mockConn([
      {
        match: (sql) => sql.includes('SELECT id, code, is_super_admin FROM roles'),
        result: [[{ id: 1, code: 'admin', is_super_admin: 1 }]],
      },
      {
        match: (sql) => sql.includes('INSERT INTO role_permissions'),
        result: [{ affectedRows: 339 }],
      },
    ]);

    const result = await syncRolePermissionsFromMenus(conn, 1, []);

    expect(result.inserted).toBe(339);
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('SELECT ?, id, NOW() FROM permissions WHERE status = 1'),
      [1]
    );
  });

  test('禁用菜单不会向角色授予权限', async () => {
    const conn = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([
          [{ id: 9, permission: 'system:users:update', name: '用户编辑', status: 0 }],
        ]),
    };

    await grantMenuPermissionToRoles(conn, 9, [1, 2]);

    expect(conn.execute).toHaveBeenCalledTimes(1);
    expect(conn.execute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT IGNORE INTO role_permissions'),
      expect.anything()
    );
  });
});
