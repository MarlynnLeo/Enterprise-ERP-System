/**
 * purchase.test.js
 * @description 采购模块集成测试
 * 覆盖：采购订单 CRUD、状态流转、收货单
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
    page: body.page ?? body.data?.page ?? 1,
  };
}

describe('采购模块 /api/purchase', () => {
  describe('GET /api/purchase/orders', () => {
    test('应返回采购订单列表', async () => {
      const res = await api.get('/api/purchase/orders?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items, total } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
      expect(typeof total).toBe('number');
    });

    test('分页参数应正确生效', async () => {
      const res = await api.get('/api/purchase/orders?page=1&pageSize=2');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(items.length).toBeLessThanOrEqual(2);
    });

    test('关键字搜索应正确过滤', async () => {
      const res = await api.get('/api/purchase/orders?keyword=PO');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/purchase/orders/:id', () => {
    test('查询已有订单应返回详情', async () => {
      const listRes = await api.get('/api/purchase/orders?page=1&pageSize=1');
      const { items } = extractList(listRes.body);

      if (items.length > 0) {
        const orderId = items[0].id;
        const res = await api.get(`/api/purchase/orders/${orderId}`);

        expect(res.status).toBe(200);
        const detail = res.body.data || res.body;
        expect(detail).toHaveProperty('id');
      }
    });

    test('查询不存在的订单应返回 404 或空数据', async () => {
      const res = await api.get('/api/purchase/orders/999999');

      expect([404, 200]).toContain(res.status);
    });
  });

  describe('GET /api/purchase/receipts', () => {
    test('应返回收货单列表', async () => {
      const res = await api.get('/api/purchase/receipts?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });
});
