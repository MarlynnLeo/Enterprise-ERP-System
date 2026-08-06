/**
 * baseData.test.js
 * @description 基础数据模块集成测试
 * 覆盖：物料管理、BOM管理、客户管理、供应商管理、
 *       产品分类、产品单位、库位管理、仓库管理、
 *       工序模板、产品大类、物料来源、检验方式
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

// ==================== 物料管理 ====================
describe('基础数据 - 物料管理 /api/base-data/materials', () => {
  test('应返回物料列表', async () => {
    const res = await api.get('/api/base-data/materials?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回物料选项列表', async () => {
    const res = await api.get('/api/base-data/materials/options');

    expect(res.status).toBe(200);
  });

  test('应返回物料统计', async () => {
    const res = await api.get('/api/base-data/materials/stats');

    expect(res.status).toBe(200);
  });

  test('应返回下一个物料编码', async () => {
    const res = await api.get('/api/base-data/materials/next-code?prefix=MAT');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('nextSequence');
  });

  test('查询已有物料应返回详情', async () => {
    const listRes = await api.get('/api/base-data/materials?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/materials/${id}`);
      expect(res.status).toBe(200);
    }
  });

  test('查询已有物料的附件列表', async () => {
    const listRes = await api.get('/api/base-data/materials?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/materials/${id}/attachments`);
      expect(res.status).toBe(200);
    }
  });

  test('查询已有物料的价格历史', async () => {
    const listRes = await api.get('/api/base-data/materials?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/materials/${id}/price-history`);
      expect(res.status).toBe(200);
    }
  });

  test('查询已有物料的BOM', async () => {
    const listRes = await api.get('/api/base-data/boms?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      // BOM 列表 API 出参 camel（productId）
      const productId = items[0].productId ?? items[0].product_id;
      expect(productId).toBeTruthy();
      const res = await api.get(`/api/base-data/materials/${productId}/bom`);
      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(Array.isArray(data)).toBe(true);
      expect(data.length).toBeGreaterThan(0);
      // 明细出参 camel
      expect(data[0].productCode || data[0].product_code).toBeTruthy();
    }
  });
});

// ==================== BOM管理 ====================
describe('基础数据 - BOM管理 /api/base-data/boms', () => {
  test('应返回BOM列表', async () => {
    const res = await api.get('/api/base-data/boms?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回BOM统计', async () => {
    const res = await api.get('/api/base-data/boms/stats');

    expect(res.status).toBe(200);
  });

  test('应返回循环引用检测结果', async () => {
    const res = await api.get('/api/base-data/boms/detect-circular');

    expect(res.status).toBe(400);
  });

  test('查询已有BOM应返回详情', async () => {
    const listRes = await api.get('/api/base-data/boms?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/boms/${id}`);
      expect(res.status).toBe(200);
    }
  });

  test('查询已有BOM的明细', async () => {
    const listRes = await api.get('/api/base-data/boms?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/boms/${id}/details`);
      expect(res.status).toBe(200);
    }
  });

  test('BOM展开应返回数据', async () => {
    const listRes = await api.get('/api/base-data/boms?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/boms/${id}/explode`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 客户管理 ====================
describe('基础数据 - 客户管理 /api/base-data/customers', () => {
  test('应返回客户列表', async () => {
    const res = await api.get('/api/base-data/customers?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回客户统计', async () => {
    const res = await api.get('/api/base-data/customers/stats');

    expect(res.status).toBe(200);
  });

  test('查询已有客户应返回详情', async () => {
    const listRes = await api.get('/api/base-data/customers?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/customers/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 供应商管理 ====================
describe('基础数据 - 供应商管理 /api/base-data/suppliers', () => {
  test('应返回供应商列表', async () => {
    const res = await api.get('/api/base-data/suppliers?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回供应商选项列表', async () => {
    const res = await api.get('/api/base-data/suppliers/options');

    expect(res.status).toBe(200);
  });

  test('查询已有供应商应返回详情', async () => {
    const listRes = await api.get('/api/base-data/suppliers?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/suppliers/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 产品分类 ====================
describe('基础数据 - 产品分类 /api/base-data/categories', () => {
  test('应返回产品分类列表', async () => {
    const res = await api.get('/api/base-data/categories');

    expect(res.status).toBe(200);
  });

  test('查询已有分类应返回详情', async () => {
    const listRes = await api.get('/api/base-data/categories');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/categories/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 产品单位 ====================
describe('基础数据 - 产品单位 /api/base-data/units', () => {
  test('应返回单位列表', async () => {
    const res = await api.get('/api/base-data/units');

    expect(res.status).toBe(200);
  });

  test('应返回单位统计', async () => {
    const res = await api.get('/api/base-data/units/stats');

    expect(res.status).toBe(200);
  });

  test('查询已有单位应返回详情', async () => {
    const listRes = await api.get('/api/base-data/units');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/units/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 库位管理 ====================
describe('基础数据 - 库位管理 /api/base-data/locations', () => {
  test('应返回库位列表', async () => {
    const res = await api.get('/api/base-data/locations');

    expect(res.status).toBe(200);
  });

  test('查询已有库位应返回详情', async () => {
    const listRes = await api.get('/api/base-data/locations');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/locations/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 仓库管理 ====================
describe('基础数据 - 仓库管理 /api/base-data/warehouses', () => {
  test('应返回仓库列表', async () => {
    const res = await api.get('/api/base-data/warehouses');

    expect(res.status).toBe(200);
  });
});

// ==================== 工序模板 ====================
describe('基础数据 - 工序模板 /api/base-data/process-templates', () => {
  test('应返回工序模板列表', async () => {
    const res = await api.get('/api/base-data/process-templates?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('查询已有工序模板应返回详情', async () => {
    const listRes = await api.get('/api/base-data/process-templates?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/process-templates/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 产品大类 ====================
describe('基础数据 - 产品大类 /api/base-data/product-categories', () => {
  test('应返回产品大类列表', async () => {
    const res = await api.get('/api/base-data/product-categories');

    expect(res.status).toBe(200);
  });

  test('应返回产品大类选项', async () => {
    const res = await api.get('/api/base-data/product-categories/options');

    expect(res.status).toBe(200);
  });

  test('应返回产品大类统计', async () => {
    const res = await api.get('/api/base-data/product-categories/statistics');

    expect(res.status).toBe(200);
  });

  test('查询已有大类应返回详情', async () => {
    const listRes = await api.get('/api/base-data/product-categories');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/product-categories/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 物料来源 ====================
describe('基础数据 - 物料来源 /api/base-data/material-sources', () => {
  test('应返回物料来源列表', async () => {
    const res = await api.get('/api/base-data/material-sources');

    expect(res.status).toBe(200);
  });

  test('应返回物料来源统计', async () => {
    const res = await api.get('/api/base-data/material-sources/statistics');

    expect(res.status).toBe(200);
  });

  test('查询已有来源应返回详情', async () => {
    const listRes = await api.get('/api/base-data/material-sources');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/material-sources/${id}`);
      expect(res.status).toBe(200);
    }
  });
});

// ==================== 检验方式 ====================
describe('基础数据 - 检验方式 /api/base-data/inspection-methods', () => {
  test('应返回检验方式列表', async () => {
    const res = await api.get('/api/base-data/inspection-methods');

    expect(res.status).toBe(200);
  });

  test('查询已有检验方式应返回详情', async () => {
    const listRes = await api.get('/api/base-data/inspection-methods');
    const data = listRes.body.data || listRes.body;
    const items = Array.isArray(data) ? data : (data?.data || data?.list || data?.items || []);

    if (items.length > 0) {
      const id = items[0].id;
      const res = await api.get(`/api/base-data/inspection-methods/${id}`);
      expect(res.status).toBe(200);
    }
  });
});
