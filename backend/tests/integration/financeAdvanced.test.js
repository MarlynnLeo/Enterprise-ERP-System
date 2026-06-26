/**
 * financeAdvanced.test.js
 * @description 财务模块高级集成测试
 * 覆盖：总账（GL）、应收账款（AR）、应付账款（AP）、
 *       现金管理、税务管理、预算管理、成本核算、
 *       费用管理、财务期间、成本中心
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

// ==================== 总账管理 ====================
describe('财务管理 - 总账 /api/finance', () => {
  test('应返回科目表', async () => {
    const res = await api.get('/api/finance/accounts');

    expect(res.status).toBe(200);
  });

  test('应返回科目选项列表', async () => {
    const res = await api.get('/api/finance/accounts/options');

    expect(res.status).toBe(200);
  });

  test('应返回会计分录列表', async () => {
    const res = await api.get('/api/finance/entries?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});

// ==================== 应收账款 ====================
describe('财务管理 - 应收账款 /api/finance/ar', () => {
  test('应返回应收发票列表', async () => {
    const res = await api.get('/api/finance/ar/invoices?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回应收账龄分析', async () => {
    const res = await api.get('/api/finance/ar/aging');

    expect(res.status).toBe(200);
  });

  test('应返回应收收款记录', async () => {
    const res = await api.get('/api/finance/ar/receipts?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('应返回客户应收汇总', async () => {
    const res = await api.get('/api/finance/ar/customer-receivables');

    expect(res.status).toBe(200);
  });

  test('查询已有发票应返回详情', async () => {
    const listRes = await api.get('/api/finance/ar/invoices?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const invoiceId = items[0].id;
      const res = await api.get(`/api/finance/ar/invoices/${invoiceId}`);

      expect(res.status).toBe(200);
    }
  });

  test('应返回未付清发票列表', async () => {
    const res = await api.get('/api/finance/ar/receipts/unpaid-invoices');

    expect(res.status).toBe(200);
  });
});

// ==================== 应付账款 ====================
describe('财务管理 - 应付账款 /api/finance/ap', () => {
  test('应返回应付发票列表', async () => {
    const res = await api.get('/api/finance/ap/invoices?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回应付账龄分析', async () => {
    const res = await api.get('/api/finance/ap/aging');

    expect(res.status).toBe(200);
  });

  test('应返回应付付款记录', async () => {
    const res = await api.get('/api/finance/ap/payments?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('应返回供应商应付汇总', async () => {
    const res = await api.get('/api/finance/ap/supplier-payables');

    expect(res.status).toBe(200);
  });
});

// ==================== 现金管理 ====================
describe('财务管理 - 现金管理 /api/finance/cash', () => {
  test('应返回银行账户列表', async () => {
    const res = await api.get('/api/finance/bank-accounts');

    expect(res.status).toBe(200);
  });

  test('应返回银行交易记录', async () => {
    const res = await api.get('/api/finance/bank-transactions?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 税务管理 ====================
describe('财务管理 - 税务管理 /api/finance/tax', () => {
  test('应返回税务发票列表', async () => {
    const res = await api.get('/api/finance/tax/invoices?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 预算管理 ====================
describe('财务管理 - 预算管理 /api/finance/budgets', () => {
  test('应返回预算列表', async () => {
    const res = await api.get('/api/finance/budgets?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});

// ==================== 成本核算 ====================
describe('财务管理 - 成本核算 /api/finance/cost-ledger', () => {
  test('应返回成本记录列表', async () => {
    const res = await api.get('/api/finance/cost-ledger?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 成本中心 ====================
describe('财务管理 - 成本中心 /api/finance/cost-centers', () => {
  test('应返回成本中心列表', async () => {
    const res = await api.get('/api/finance/cost-centers?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 财务期间 ====================
describe('财务管理 - 财务期间 /api/finance/periods', () => {
  test('应返回财务期间列表', async () => {
    const res = await api.get('/api/finance/periods');

    expect(res.status).toBe(200);
  });
});

// ==================== 费用管理 ====================
describe('财务管理 - 费用管理 /api/finance/expenses', () => {
  test('应返回费用列表', async () => {
    const res = await api.get('/api/finance/expenses?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回费用类型列表', async () => {
    const res = await api.get('/api/finance/expenses/categories');

    expect(res.status).toBe(200);
  });

  test('应返回费用统计', async () => {
    const res = await api.get('/api/finance/expenses/stats');

    expect(res.status).toBe(200);
  });
});

// ==================== 资产管理 ====================
describe('财务管理 - 资产管理 /api/finance/assets', () => {
  test('应返回资产列表', async () => {
    const res = await api.get('/api/finance/assets?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });
});

// ==================== 财务设置 ====================
describe('财务管理 - 财务设置 /api/finance/settings', () => {
  test('应返回财务设置', async () => {
    const res = await api.get('/api/finance/settings');

    expect(res.status).toBe(200);
  });
});
