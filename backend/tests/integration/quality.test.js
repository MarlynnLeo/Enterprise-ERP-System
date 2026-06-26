/**
 * quality.test.js
 * @description 质量管理模块集成测试
 * 覆盖：来料检验、过程检验、成品检验、首检管理、检验模板、
 *       质量标准、AQL标准、质量统计、不合格品处理
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
 * 辅助函数：从响应中提取列表数据
 * 兼容多种后端响应格式：
 * 1. { items, total }
 * 2. { data: { list, total } }
 * 3. { data: { data: rows, pagination } } (ResponseHandler 嵌套格式)
 * 4. { success, data: { data: rows, pagination } } (未解包的 ResponseHandler)
 */
function extractList(body) {
  // ResponseHandler 嵌套格式: body.data 本身包含 { data: rows, pagination }
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

// ==================== 来料检验 ====================
describe('质量管理 - 来料检验 /api/quality/inspections/incoming', () => {
  test('应返回来料检验列表', async () => {
    const res = await api.get('/api/quality/inspections/incoming?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回来料检验统计', async () => {
    const res = await api.get('/api/quality/inspections/incoming/stats');

    expect(res.status).toBe(200);
  });
});

// ==================== 过程检验 ====================
describe('质量管理 - 过程检验 /api/quality/inspections/process', () => {
  test('应返回过程检验列表', async () => {
    const res = await api.get('/api/quality/inspections/process?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回过程检验统计', async () => {
    const res = await api.get('/api/quality/inspections/process/stats');

    expect(res.status).toBe(200);
  });
});

// ==================== 成品检验 ====================
describe('质量管理 - 成品检验 /api/quality/inspections/final', () => {
  test('应返回成品检验列表', async () => {
    const res = await api.get('/api/quality/inspections/final?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回成品检验统计', async () => {
    const res = await api.get('/api/quality/inspections/final/stats');

    expect(res.status).toBe(200);
  });
});

// ==================== 首检管理 ====================
describe('质量管理 - 首检管理 /api/quality/inspections/first-article', () => {
  test('应返回首检列表', async () => {
    const res = await api.get('/api/quality/inspections/first-article?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回首检统计', async () => {
    const res = await api.get('/api/quality/inspections/first-article/stats');

    expect(res.status).toBe(200);
  });

  test('应返回首检规则列表', async () => {
    const res = await api.get('/api/quality/first-article-rules');

    expect(res.status).toBe(200);
  });
});

// ==================== 检验单详情 ====================
describe('质量管理 - 检验单详情', () => {
  test('查询已有检验单应返回详情', async () => {
    const listRes = await api.get('/api/quality/inspections/incoming?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const inspectionId = items[0].id;
      const res = await api.get(`/api/quality/inspections/${inspectionId}`);

      expect(res.status).toBe(200);
      const detail = res.body.data || res.body;
      expect(detail).toHaveProperty('id');
    }
  });

  test('查询已有检验单的检验项目', async () => {
    const listRes = await api.get('/api/quality/inspections/incoming?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const inspectionId = items[0].id;
      const res = await api.get(`/api/quality/inspections/${inspectionId}/items`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== 检验模板 ====================
describe('质量管理 - 检验模板 /api/quality/templates', () => {
  test('应返回检验模板列表', async () => {
    const res = await api.get('/api/quality/templates?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回可复用检验项', async () => {
    const res = await api.get('/api/quality/templates/reusable-items');

    expect(res.status).toBe(200);
  });

  test('查询已有模板应返回详情', async () => {
    const listRes = await api.get('/api/quality/templates?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const templateId = items[0].id;
      const res = await api.get(`/api/quality/templates/${templateId}`);

      expect(res.status).toBe(200);
      const detail = res.body.data || res.body;
      expect(detail).toHaveProperty('id');
    }
  });
});

// ==================== 质量标准 ====================
describe('质量管理 - 质量标准 /api/quality/quality-standards', () => {
  test('应返回质量标准列表', async () => {
    const res = await api.get('/api/quality/quality-standards?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('查询已有标准应返回详情', async () => {
    const listRes = await api.get('/api/quality/quality-standards?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const standardId = items[0].id;
      const res = await api.get(`/api/quality/quality-standards/${standardId}`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== AQL 标准 ====================
describe('质量管理 - AQL标准 /api/quality/aql', () => {
  test('应返回AQL标准列表', async () => {
    const res = await api.get('/api/quality/aql-standards');

    expect(res.status).toBe(200);
  });

  test('应返回AQL等级列表', async () => {
    const res = await api.get('/api/quality/aql-levels');

    expect(res.status).toBe(200);
  });
});

// ==================== 过程检验规则 ====================
describe('质量管理 - 过程检验规则 /api/quality/process-inspection/rules', () => {
  test('应返回过程检验规则列表', async () => {
    const res = await api.get('/api/quality/process-inspection/rules');

    expect(res.status).toBe(200);
  });
});

// ==================== 质量统计 ====================
describe('质量管理 - 质量统计 /api/quality/statistics', () => {
  test('应返回质量统计数据', async () => {
    const res = await api.get('/api/quality/statistics');

    expect(res.status).toBe(200);
  });

  test('应返回质量趋势数据', async () => {
    const res = await api.get('/api/quality/trends');

    expect(res.status).toBe(200);
  });

  test('应返回缺陷项数据', async () => {
    const res = await api.get('/api/quality/defect-items');

    expect(res.status).toBe(200);
  });
});

// ==================== 不合格品管理 ====================
describe('质量管理 - 不合格品 /api/quality/nonconforming-products', () => {
  test('应返回不合格品列表', async () => {
    const res = await api.get('/api/quality/nonconforming-products?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('查询已有不合格品应返回详情', async () => {
    const listRes = await api.get('/api/quality/nonconforming-products?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const ncpId = items[0].id;
      const res = await api.get(`/api/quality/nonconforming-products/${ncpId}`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== 8D报告 ====================
describe('质量管理 - 8D报告 /api/quality/eight-d-reports', () => {
  test('应返回8D报告列表', async () => {
    const res = await api.get('/api/quality/eight-d-reports?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('查询已有8D报告应返回详情', async () => {
    const listRes = await api.get('/api/quality/eight-d-reports?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const reportId = items[0].id;
      const res = await api.get(`/api/quality/eight-d-reports/${reportId}`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== 返工任务 ====================
describe('质量管理 - 返工任务 /api/quality/rework-tasks', () => {
  test('应返回返工任务列表', async () => {
    const res = await api.get('/api/quality/rework-tasks?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});

// ==================== 报废记录 ====================
describe('质量管理 - 报废记录 /api/quality/scrap-records', () => {
  test('应返回报废记录列表', async () => {
    const res = await api.get('/api/quality/scrap-records?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});

// ==================== 替代订单 ====================
describe('质量管理 - 替代订单 /api/quality/replacement-orders', () => {
  test('应返回替代订单列表', async () => {
    const res = await api.get('/api/quality/replacement-orders?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});
