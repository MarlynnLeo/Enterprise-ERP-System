/**
 * PermissionRegistry 单元测试
 */

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const {
  moduleOf,
  ensurePermission,
  syncRolePermissionsFromMenus,
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
  });
});
