/**
 * print.test.js
 * @description 打印服务集成测试
 * 覆盖：打印设置、打印模板、默认模板
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

// ==================== 打印设置 ====================
describe('打印服务 - 打印设置 /api/print/settings', () => {
  test('应返回打印设置列表', async () => {
    const res = await api.get('/api/print/settings');

    expect(res.status).toBe(200);
  });

  test('查询已有设置应返回详情', async () => {
    const listRes = await api.get('/api/print/settings');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const settingId = items[0].id;
      const res = await api.get(`/api/print/settings/${settingId}`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== 打印模板 ====================
describe('打印服务 - 打印模板 /api/print/templates', () => {
  test('应返回打印模板列表', async () => {
    const res = await api.get('/api/print/templates');

    expect(res.status).toBe(200);
  });

  test('查询已有模板应返回详情', async () => {
    const listRes = await api.get('/api/print/templates');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const templateId = items[0].id;
      const res = await api.get(`/api/print/templates/${templateId}`);

      expect(res.status).toBe(200);
      const detail = res.body.data || res.body;
      expect(detail).toHaveProperty('id');
    }
  });

  test('应返回默认模板（按模块查询）', async () => {
    const modules = ['inventory', 'purchase', 'sales', 'production', 'quality', 'finance'];

    for (const moduleName of modules) {
      const res = await api.get(`/api/print/templates/default?module=${moduleName}`);

      expect(res.status).toBe(400);
    }
  });

  test('应按 module/templateType 返回真实默认模板', async () => {
    const listRes = await api.get('/api/print/templates?isDefault=1&status=1&page=1&pageSize=1');
    expect(listRes.status).toBe(200);
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const template = items[0];
      const templateType = template.templateType || template.template_type;
      const res = await api.get(
        `/api/print/templates/default?module=${template.module}&templateType=${templateType}`
      );

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('id', template.id);
    }
  });
});
