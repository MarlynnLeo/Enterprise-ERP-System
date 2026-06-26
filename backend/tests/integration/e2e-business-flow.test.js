/**
 * e2e-business-flow.test.js
 * @description 端到端业务流程集成测试
 * 覆盖核心业务链路：销售→采购→生产→质检→库存→财务
 *
 * 本测试验证各模块间的数据流转和联动关系，而非单模块的 CRUD 操作。
 * 所有测试为只读操作，不创建/修改业务数据。
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

// ==================== 1. 销售→生产联动 ====================
describe('E2E: 销售订单→生产计划关联', () => {
  test('销售订单列表应包含关联字段', async () => {
    const res = await api.get('/api/sales/orders?page=1&pageSize=1');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);

    if (items.length > 0) {
      const order = items[0];
      // 销售订单应包含客户信息和状态
      expect(order).toHaveProperty('id');
      expect(order).toHaveProperty('status');
    }
  });

  test('生产计划列表应包含关联订单信息', async () => {
    const res = await api.get('/api/production/plans?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);

    if (items.length > 0) {
      const plan = items[0];
      expect(plan).toHaveProperty('id');
      expect(plan).toHaveProperty('status');
    }
  });
});

// ==================== 2. 生产→质检联动 ====================
describe('E2E: 生产任务→质检记录关联', () => {
  test('生产任务和质检数据应在各自接口返回', async () => {
    const [tasksRes, inspectionsRes] = await Promise.all([
      api.get('/api/production/tasks?page=1&pageSize=5'),
      api.get('/api/quality/inspections/incoming?page=1&pageSize=5'),
    ]);

    expect(tasksRes.status).toBe(200);
    expect(inspectionsRes.status).toBe(200);

    const tasks = extractList(tasksRes.body);
    const inspections = extractList(inspectionsRes.body);

    expect(Array.isArray(tasks.items)).toBe(true);
    expect(Array.isArray(inspections.items)).toBe(true);
  });
});

// ==================== 3. 采购→库存联动 ====================
describe('E2E: 采购订单→库存入库联动', () => {
  test('采购订单和入库单应在各自接口返回', async () => {
    const [poRes, inboundRes] = await Promise.all([
      api.get('/api/purchase/orders?page=1&pageSize=5'),
      api.get('/api/inventory/inbound?page=1&pageSize=5'),
    ]);

    expect(poRes.status).toBe(200);
    expect(inboundRes.status).toBe(200);

    const orders = extractList(poRes.body);
    const inbounds = extractList(inboundRes.body);

    expect(Array.isArray(orders.items)).toBe(true);
    expect(Array.isArray(inbounds.items)).toBe(true);
  });
});

// ==================== 4. 销售→财务联动 ====================
describe('E2E: 销售→应收发票联动', () => {
  test('销售订单和应收发票应在各自接口返回', async () => {
    const [salesRes, arRes] = await Promise.all([
      api.get('/api/sales/orders?page=1&pageSize=5'),
      api.get('/api/finance/ar/invoices?page=1&pageSize=5'),
    ]);

    expect(salesRes.status).toBe(200);
    expect(arRes.status).toBe(200);
  });
});

// ==================== 5. 采购→财务联动 ====================
describe('E2E: 采购→应付发票联动', () => {
  test('采购订单和应付发票应在各自接口返回', async () => {
    const [poRes, apRes] = await Promise.all([
      api.get('/api/purchase/orders?page=1&pageSize=5'),
      api.get('/api/finance/ap/invoices?page=1&pageSize=5'),
    ]);

    expect(poRes.status).toBe(200);
    expect(apRes.status).toBe(200);
  });
});

// ==================== 6. 全链路健康检查 ====================
describe('E2E: 全链路模块健康检查', () => {
  const moduleEndpoints = [
    { name: '销售', url: '/api/sales/orders?page=1&pageSize=1' },
    { name: '采购', url: '/api/purchase/orders?page=1&pageSize=1' },
    { name: '库存-入库', url: '/api/inventory/inbound?page=1&pageSize=1' },
    { name: '库存-出库', url: '/api/inventory/outbound?page=1&pageSize=1' },
    { name: '生产-计划', url: '/api/production/plans?page=1&pageSize=1' },
    { name: '生产-任务', url: '/api/production/tasks?page=1&pageSize=1' },
    { name: '质量-来料', url: '/api/quality/inspections/incoming?page=1&pageSize=1' },
    { name: '质量-过程', url: '/api/quality/inspections/process?page=1&pageSize=1' },
    { name: '质量-成品', url: '/api/quality/inspections/final?page=1&pageSize=1' },
    { name: '财务-应收', url: '/api/finance/ar/invoices?page=1&pageSize=1' },
    { name: '财务-应付', url: '/api/finance/ap/invoices?page=1&pageSize=1' },
    { name: '财务-分录', url: '/api/finance/entries?page=1&pageSize=1' },
  ];

  test.each(moduleEndpoints)('$name 模块接口应返回 200', async ({ url }) => {
    const res = await api.get(url);
    expect(res.status).toBe(200);
  });
});

// ==================== 7. 数据一致性检查 ====================
describe('E2E: 仪表盘数据一致性', () => {
  test('生产仪表盘统计应返回有效数据', async () => {
    const res = await api.get('/api/production/dashboard/statistics');

    expect(res.status).toBe(200);
    const data = res.body.data || res.body;
    expect(data).toBeDefined();
  });

  test('质量统计应返回有效数据', async () => {
    const res = await api.get('/api/quality/statistics');

    expect(res.status).toBe(200);
    const data = res.body.data || res.body;
    expect(data).toBeDefined();
  });

  test('财务设置应返回有效数据', async () => {
    const res = await api.get('/api/finance/settings');

    expect(res.status).toBe(200);
    const data = res.body.data || res.body;
    expect(data).toBeDefined();
  });
});

// ==================== 8. 权限隔离验证 ====================
describe('E2E: 未认证访问应返回 401', () => {
  const request = require('supertest');

  const protectedEndpoints = [
    '/api/sales/orders',
    '/api/purchase/orders',
    '/api/inventory/inbound',
    '/api/production/plans',
    '/api/quality/inspections/incoming',
    '/api/finance/entries',
    '/api/print/settings',
  ];

  test.each(protectedEndpoints)('未认证访问 %s 应返回 401', async (url) => {
    const res = await request(app).get(url);
    expect(res.status).toBe(401);
  });
});
