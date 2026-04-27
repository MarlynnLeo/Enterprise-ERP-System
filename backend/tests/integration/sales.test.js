/**
 * sales.test.js
 * @description 销售、财务、生产模块集成测试
 * 覆盖：销售订单、出库单、退货单、发票、生产任务
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
 * 辅助函数：兼容不同 API 响应格式
 */
function extractList(body) {
  return {
    items: body.items || body.data?.list || body.data?.items || [],
    total: body.total ?? body.data?.total ?? 0,
  };
}

describe('销售模块 /api/sales', () => {
  describe('GET /api/sales/orders', () => {
    test('应返回销售订单列表', async () => {
      const res = await api.get('/api/sales/orders?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items, total } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
      expect(typeof total).toBe('number');
    });

    test('分页参数应正确生效', async () => {
      const res = await api.get('/api/sales/orders?page=1&pageSize=2');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/sales/outbound', () => {
    test('应返回销售出库单列表', async () => {
      const res = await api.get('/api/sales/outbound?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/sales/returns', () => {
    test('应返回销售退货单列表', async () => {
      const res = await api.get('/api/sales/returns?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('订单详情', () => {
    test('查询已有订单应返回完整详情', async () => {
      const listRes = await api.get('/api/sales/orders?page=1&pageSize=1');
      const { items } = extractList(listRes.body);

      if (items.length > 0) {
        const orderId = items[0].id;
        const res = await api.get(`/api/sales/orders/${orderId}`);

        expect(res.status).toBe(200);
        const detail = res.body.data || res.body;
        expect(detail).toHaveProperty('id');
      }
    });
  });
});

describe('财务模块 /api/finance', () => {
  describe('GET /api/finance/ar/invoices', () => {
    test('应返回应收发票列表', async () => {
      const res = await api.get('/api/finance/ar/invoices?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/finance/ap/invoices', () => {
    test('应返回应付发票列表', async () => {
      const res = await api.get('/api/finance/ap/invoices?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });
});

describe('生产模块 /api/production', () => {
  describe('GET /api/production/tasks', () => {
    test('应返回生产任务列表', async () => {
      const res = await api.get('/api/production/tasks?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/production/plans', () => {
    test('应返回生产计划列表', async () => {
      const res = await api.get('/api/production/plans?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });
});
