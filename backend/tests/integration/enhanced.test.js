/**
 * enhanced.test.js
 * @description 增强模块集成测试
 * 覆盖：编码规则、单据关联、汇率、绩效管理、ECN变更、文档管理、业务告警
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

// ==================== 编码规则 ====================
describe('增强模块 - 编码规则 /api/enhanced/coding-rules', () => {
  test('应返回编码规则列表', async () => {
    const res = await api.get('/api/enhanced/coding-rules');

    expect(res.status).toBe(200);
  });

  test('查询已有规则应返回详情', async () => {
    const listRes = await api.get('/api/enhanced/coding-rules');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/enhanced/coding-rules/${id}`);
      expect(res.status).toBe(200);
    }
  });

  test('应返回编码预览', async () => {
    const res = await api.get('/api/enhanced/coding-rules/preview/sales_order');

    expect(res.status).toBe(200);
  });

  test('应返回编码序列', async () => {
    const res = await api.get('/api/enhanced/coding-rules/sequences/sales_order');

    expect(res.status).toBe(200);
  });
});

// ==================== 单据关联 ====================
describe('增强模块 - 单据关联 /api/enhanced/document-links', () => {
  test('应返回单据类型标签', async () => {
    const res = await api.get('/api/enhanced/document-links/types');

    expect(res.status).toBe(200);
  });
});

// ==================== 汇率 ====================
describe('增强模块 - 汇率 /api/enhanced/exchange-rates', () => {
  test('应返回汇率列表', async () => {
    const res = await api.get('/api/enhanced/exchange-rates?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('应返回最新汇率', async () => {
    const res = await api.get('/api/enhanced/exchange-rates/latest?from=USD&to=CNY');

    expect(res.status).toBe(200);
  });
});

// ==================== 绩效管理 ====================
describe('增强模块 - 绩效管理 /api/enhanced/performance', () => {
  test('应返回绩效指标列表', async () => {
    const res = await api.get('/api/enhanced/performance/indicators');

    expect(res.status).toBe(200);
  });

  test('应返回绩效周期列表', async () => {
    const res = await api.get('/api/enhanced/performance/periods');

    expect(res.status).toBe(200);
  });

  test('应返回绩效评估列表', async () => {
    const res = await api.get('/api/enhanced/performance/evaluations');

    expect(res.status).toBe(200);
  });
});

// ==================== ECN变更管理 ====================
describe('增强模块 - ECN变更 /api/enhanced/ecn', () => {
  test('应返回ECN列表', async () => {
    const res = await api.get('/api/enhanced/ecn?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('查询已有ECN应返回详情', async () => {
    const listRes = await api.get('/api/enhanced/ecn?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/enhanced/ecn/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 文档管理 ====================
describe('增强模块 - 文档管理 /api/enhanced/documents', () => {
  test('应返回文档列表', async () => {
    const res = await api.get('/api/enhanced/documents?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 业务告警 ====================
describe('增强模块 - 业务告警 /api/enhanced/business-alerts', () => {
  test('应返回告警列表', async () => {
    const res = await api.get('/api/enhanced/business-alerts?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});
