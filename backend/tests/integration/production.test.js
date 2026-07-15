/**
 * production.test.js
 * @description 生产管理模块集成测试
 * 覆盖：生产计划、生产任务、生产过程、生产报工、排程、
 *       仪表盘、物料需求、甘特图
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

// ==================== 生产仪表盘 ====================
describe('生产管理 - 仪表盘 /api/production/dashboard', () => {
  test('应返回仪表盘统计数据', async () => {
    const res = await api.get('/api/production/dashboard/statistics');

    expect(res.status).toBe(200);
  });

  test('应返回仪表盘趋势数据', async () => {
    const res = await api.get('/api/production/dashboard/trends');

    expect(res.status).toBe(200);
  });

  test('应返回工序完成率', async () => {
    const res = await api.get('/api/production/dashboard/process-completion');

    expect(res.status).toBe(200);
  });

  test('应返回待处理任务', async () => {
    const res = await api.get('/api/production/dashboard/pending-tasks');

    expect(res.status).toBe(200);
  });

  test('应返回仪表盘生产计划', async () => {
    const res = await api.get('/api/production/dashboard/plans');

    expect(res.status).toBe(200);
  });
});

// ==================== 生产计划 ====================
describe('生产管理 - 生产计划 /api/production/plans', () => {
  test('应返回生产计划列表', async () => {
    const res = await api.get('/api/production/plans?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('分页参数应正确生效', async () => {
    const res = await api.get('/api/production/plans?page=1&pageSize=2');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(items.length).toBeLessThanOrEqual(2);
  });

  test('查询已有计划应返回详情', async () => {
    const listRes = await api.get('/api/production/plans?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const planId = items[0].id;
      const res = await api.get(`/api/production/plans/${planId}`);

      expect(res.status).toBe(200);
      const detail = res.body.data || res.body;
      expect(detail).toHaveProperty('id');
    }
  });

  test('查询已有计划的物料清单', async () => {
    const listRes = await api.get('/api/production/plans?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const planId = items[0].id;
      const res = await api.get(`/api/production/plans/${planId}/materials`);

      expect(res.status).toBe(200);
    }
  });

  test('应返回当天最大序号', async () => {
    const res = await api.get('/api/production/today-sequence');

    expect(res.status).toBe(200);
  });
});

// ==================== 生产任务 ====================
describe('生产管理 - 生产任务 /api/production/tasks', () => {
  test('应返回生产任务列表', async () => {
    const res = await api.get('/api/production/tasks?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('应返回任务管理员列表', async () => {
    const res = await api.get('/api/production/tasks/managers');

    expect(res.status).toBe(200);
  });

  test('应生成任务编码', async () => {
    const res = await api.get('/api/production/tasks/generate-code');

    expect(res.status).toBe(200);
  });

  test('查询已有任务应返回详情', async () => {
    const listRes = await api.get('/api/production/tasks?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const taskId = items[0].id;
      const res = await api.get(`/api/production/tasks/${taskId}`);

      expect(res.status).toBe(200);
      const detail = res.body.data || res.body;
      expect(detail).toHaveProperty('id');
    }
  });

  test('查询已有任务的BOM', async () => {
    const listRes = await api.get('/api/production/tasks?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const taskId = items[0].id;
      const res = await api.get(`/api/production/tasks/${taskId}/bom`);

      expect(res.status).toBe(200);
      const data = res.body.data || res.body;
      expect(Array.isArray(data)).toBe(true);
    }
  });
});

// ==================== 生产过程 ====================
describe('生产管理 - 生产过程 /api/production/processes', () => {
  test('应返回工序列表', async () => {
    const res = await api.get('/api/production/processes?page=1&pageSize=5');

    expect(res.status).toBe(200);
    const { items } = extractList(res.body);
    expect(Array.isArray(items)).toBe(true);
  });

  test('查询已有工序应返回详情', async () => {
    const listRes = await api.get('/api/production/processes?page=1&pageSize=1');
    const { items } = extractList(listRes.body);

    if (items.length > 0) {
      const processId = items[0].id;
      const res = await api.get(`/api/production/processes/${processId}`);

      expect(res.status).toBe(200);
    }
  });
});

// ==================== 生产报工 ====================
describe('生产管理 - 生产报工 /api/production/reports', () => {
  test('应返回报工汇总数据', async () => {
    const res = await api.get('/api/production/reports/summary?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('应返回报工明细数据', async () => {
    const res = await api.get('/api/production/reports/detail?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });

  test('应返回报工统计数据', async () => {
    const res = await api.get('/api/production/reports/statistics');

    expect(res.status).toBe(200);
  });

  test('查询已有任务的报工统计', async () => {
    const tasksRes = await api.get('/api/production/tasks?page=1&pageSize=1');
    const { items } = extractList(tasksRes.body);

    if (items.length > 0) {
      const taskId = items[0].id;

      const statsRes = await api.get(`/api/production/reports/task/${taskId}/stats`);
      expect(statsRes.status).toBe(200);

      const processesRes = await api.get(`/api/production/reports/task/${taskId}/processes`);
      expect(processesRes.status).toBe(200);
    }
  });
});

// ==================== 排程 ====================
describe('生产管理 - 排程 /api/production/scheduling', () => {
  test('应返回默认日历', async () => {
    const res = await api.get('/api/production/scheduling/calendar');

    expect(res.status).toBe(200);
  });

  test('应返回日历列表', async () => {
    const res = await api.get('/api/production/scheduling/calendars');

    expect(res.status).toBe(200);
  });

  test('应返回日历覆盖日期', async () => {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const res = await api.get(`/api/production/scheduling/calendar-overrides?month=${month}`);

    expect(res.status).toBe(200);
  });

  test('应返回甘特图数据', async () => {
    const res = await api.get('/api/production/scheduling/gantt');

    expect(res.status).toBe(200);
  });
});

// ==================== 物料需求 ====================
describe('生产管理 - 物料需求 /api/production', () => {
  test('应返回缺料统计', async () => {
    const res = await api.get('/api/production/material-shortage-summary');

    expect(res.status).toBe(200);
  });
});
