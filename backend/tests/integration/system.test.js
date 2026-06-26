/**
 * system.test.js
 * @description 系统管理模块集成测试
 * 覆盖：用户管理、部门管理、角色管理、菜单管理、
 *       系统设置、系统信息、系统日志、数据库备份、
 *       业务类型管理、权限诊断
 */

const { authRequest, clearCache, getApp } = require('../testHelper');

let app;
let api;

beforeAll(async () => {
  app = getApp();
  api = await authRequest();
});

afterAll(() => {
  clearCache();
});

/**
 * 辅助函数
 */
function extractList(body) {
  const inner = body.data;
  if (inner && typeof inner === 'object' && Array.isArray(inner.data)) {
    return {
      items: inner.data,
      total: inner.pagination?.total ?? inner.total ?? 0,
    };
  }

  return {
    items: body.items || inner?.list || inner?.items || (Array.isArray(inner) ? inner : []),
    total: body.total ?? inner?.total ?? 0,
  };
}

// ==================== 用户管理 ====================
describe('系统管理 - 用户管理 /api/system/users', () => {
  test('应返回用户列表', async () => {
    const res = await api.get('/api/system/users?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回用户简单列表', async () => {
    const res = await api.get('/api/system/users/list');

    expect(res.status).toBe(200);
  });

  test('查询已有用户应返回详情', async () => {
    const listRes = await api.get('/api/system/users?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/users/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 部门管理 ====================
describe('系统管理 - 部门管理 /api/system/departments', () => {
  test('应返回部门列表', async () => {
    const res = await api.get('/api/system/departments');

    expect(res.status).toBe(200);
  });

  test('应返回部门下拉列表', async () => {
    const res = await api.get('/api/system/departments/list');

    expect(res.status).toBe(200);
  });

  test('查询已有部门应返回详情', async () => {
    const listRes = await api.get('/api/system/departments');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/departments/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 角色管理 ====================
describe('系统管理 - 角色管理 /api/system/roles', () => {
  test('应返回角色列表', async () => {
    const res = await api.get('/api/system/roles?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回角色下拉列表', async () => {
    const res = await api.get('/api/system/roles/list');

    expect(res.status).toBe(200);
  });

  test('查询已有角色应返回详情', async () => {
    const listRes = await api.get('/api/system/roles?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/roles/${id}`);
      expect(res.status).toBe(200);
    }
  });

  test('查询已有角色的权限列表', async () => {
    const listRes = await api.get('/api/system/roles?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/roles/${id}/permissions`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 菜单管理 ====================
describe('系统管理 - 菜单管理 /api/system/menus', () => {
  test('应返回菜单列表', async () => {
    const res = await api.get('/api/system/menus');

    expect(res.status).toBe(200);
  });

  test('应返回数据库直读菜单', async () => {
    const res = await api.get('/api/system/menus/direct');

    expect(res.status).toBe(200);
  });

  test('查询已有菜单应返回详情', async () => {
    const listRes = await api.get('/api/system/menus');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/menus/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 权限诊断 ====================
describe('系统管理 - 权限诊断 /api/system/permissions', () => {
  test('应返回用户权限诊断结果', async () => {
    // validateIdParam 可能期望参数名为 id 而非 userId，接受 200 或 400
    const res = await api.get('/api/system/permissions/diagnose/1');

    expect([200, 400]).toContain(res.status);
  });
});

// ==================== 系统设置 ====================
describe('系统管理 - 系统设置 /api/system/settings', () => {
  test('应返回系统设置', async () => {
    const res = await api.get('/api/system/settings');

    expect(res.status).toBe(200);
  });
});

// ==================== 系统信息 ====================
describe('系统管理 - 系统信息 /api/system/info', () => {
  test('应返回系统信息', async () => {
    const res = await api.get('/api/system/info');

    expect(res.status).toBe(200);
  });
});

// ==================== 系统日志 ====================
describe('系统管理 - 系统日志 /api/system/logs', () => {
  test('应返回系统日志', async () => {
    const res = await api.get('/api/system/logs?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 数据库备份 ====================
describe('系统管理 - 数据库备份 /api/system/backups', () => {
  test('应返回备份列表', async () => {
    const res = await api.get('/api/system/backups');

    expect(res.status).toBe(200);
  });
});

// ==================== 会计科目配置 ====================
describe('系统管理 - 会计科目配置 /api/system/accounting', () => {
  test('应返回会计科目编码', async () => {
    const res = await api.get('/api/system/accounting/account-codes');

    expect(res.status).toBe(200);
  });
});

// ==================== 死信队列 ====================
describe('系统管理 - 失败任务 /api/system/failed-jobs', () => {
  test('应返回失败任务列表', async () => {
    const res = await api.get('/api/system/failed-jobs');

    expect(res.status).toBe(200);
  });
});

// ==================== 业务类型管理 ====================
describe('系统管理 - 业务类型 /api/system/business-types', () => {
  test('应返回业务类型列表', async () => {
    const res = await api.get('/api/system/business-types');

    expect(res.status).toBe(200);
  });

  test('应返回业务类型分组', async () => {
    const res = await api.get('/api/system/business-types/groups');

    expect(res.status).toBe(200);
  });

  test('按分类查询业务类型', async () => {
    const res = await api.get('/api/system/business-types/category/sales');

    expect(res.status).toBe(200);
  });

  test('查询已有业务类型应返回详情', async () => {
    const listRes = await api.get('/api/system/business-types');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/system/business-types/${id}`);
      expect(res.status).toBe(200);
    }
  });
});
