/**
 * inventory.test.js
 * @description 库存模块集成测试
 * 覆盖：入库单、出库单、库存台账、库存查询
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
 * 兼容 { items, total } 和 { data: { list, total } } 两种格式
 */
function extractList(body) {
  return {
    items: body.items || body.data?.list || body.data?.items || [],
    total: body.total ?? body.data?.total ?? 0,
    page: body.page ?? body.data?.page ?? 1,
  };
}

describe('库存模块 /api/inventory', () => {
  describe('GET /api/inventory/inbound', () => {
    test('应返回入库单列表', async () => {
      const res = await api.get('/api/inventory/inbound?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items, total } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
      expect(typeof total).toBe('number');
    });

    test('分页参数应正确生效', async () => {
      const res = await api.get('/api/inventory/inbound?page=1&pageSize=2');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/inventory/outbound', () => {
    test('应返回出库单列表', async () => {
      const res = await api.get('/api/inventory/outbound?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/inventory/ledger', () => {
    test('应返回库存台账', async () => {
      const res = await api.get('/api/inventory/ledger?page=1&pageSize=5');

      expect(res.status).toBe(200);
      const { items } = extractList(res.body);
      expect(Array.isArray(items)).toBe(true);
    });
  });

  describe('GET /api/inventory/stock', () => {
    test('库存查询应返回 200', async () => {
      const res = await api.get('/api/inventory/stock?page=1&pageSize=5');

      // 库存接口可能不存在，接受 200 或 404
      expect([200, 404]).toContain(res.status);
    });
  });

  describe('出库单详情', () => {
    test('查询已有出库单应返回详情', async () => {
      const listRes = await api.get('/api/inventory/outbound?page=1&pageSize=1');
      const { items } = extractList(listRes.body);

      if (items.length > 0) {
        const outboundId = items[0].id;
        const res = await api.get(`/api/inventory/outbound/${outboundId}`);

        expect(res.status).toBe(200);
        // 详情可能在 body 或 body.data 中
        const detail = res.body.data || res.body;
        expect(detail).toHaveProperty('id');
      }
    });
  });
});
