/**
 * auxiliary.test.js
 * @description 辅助业务模块集成测试
 * 覆盖：设备管理、设备监控、HR、员工技能、通知管理、
 *       通知规则、技术沟通、生产异常、生产辅助、装配管理、
 *       批次追溯、追溯监控、合同管理、待办事项、
 *       工作流、金属价格、聊天
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

// ==================== 设备管理 ====================
describe('设备管理 /api/equipment', () => {
  test('应返回设备列表', async () => {
    const res = await api.get('/api/equipment/list');

    expect(res.status).toBe(200);
  });
});

// ==================== 设备监控 ====================
describe('设备监控 /api/equipment-monitoring', () => {
  test('应返回设备监控数据', async () => {
    const res = await api.get('/api/equipment-monitoring/equipment?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== HR ====================
describe('人力资源 /api/hr', () => {
  test('应返回员工列表', async () => {
    const res = await api.get('/api/hr/employees?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 员工技能 ====================
describe('员工技能 /api/hr/skills', () => {
  test('应返回技能列表', async () => {
    const res = await api.get('/api/hr/skills?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 通知管理 ====================
describe('通知管理 /api/system/notifications', () => {
  test('应返回通知列表', async () => {
    const res = await api.get('/api/system/notifications?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 通知规则 ====================
describe('通知规则 /api/system/notification-rules', () => {
  test('应返回通知规则列表', async () => {
    const res = await api.get('/api/system/notification-rules');

    expect(res.status).toBe(200);
  });

  test('应提供完整事件、有效收件选项和实际收件人预览', async () => {
    const eventsRes = await api.get('/api/system/notification-rules/events');
    expect(eventsRes.status).toBe(200);
    expect(eventsRes.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event_type: 'ASSEMBLY_ALL_STEPS_COMPLETED' }),
        expect.objectContaining({ event_type: 'FINANCE_AR_INVOICE_OVERDUE' }),
      ])
    );

    const optionsRes = await api.get('/api/system/notification-rules/recipient-options');
    expect(optionsRes.status).toBe(200);
    const users = optionsRes.body.data?.users || [];
    expect(users.length).toBeGreaterThan(0);

    const previewRes = await api
      .post('/api/system/notification-rules/preview')
      .send({ recipient_type: 'user', recipient_config: [users[0].id] });
    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data).toEqual(
      expect.objectContaining({ count: expect.any(Number), recipients: expect.any(Array) })
    );
  });
});

// ==================== 技术沟通 ====================
describe('技术沟通 /api/system/technical-communications', () => {
  test('应返回技术沟通列表', async () => {
    const res = await api.get('/api/system/technical-communications?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 生产异常报告 ====================
describe('生产异常报告 /api/production/anomaly-reports', () => {
  test('应返回异常报告列表', async () => {
    const res = await api.get('/api/production/anomaly-reports?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 生产辅助 ====================
describe('生产辅助 /api/production/assist', () => {
  test('应返回辅助工具列表', async () => {
    const res = await api.get('/api/production/assist/verification-logs?page=1&pageSize=5');
    expect(res.status).toBe(200);
  });

  test('应返回生产辅助具体子路由', async () => {
    const readinessRes = await api
      .post('/api/production/assist/material-readiness/batch')
      .send({ taskIds: [] });
    expect(readinessRes.status).toBe(200);

    const logsRes = await api.get('/api/production/assist/verification-logs?page=1&pageSize=5');
    expect(logsRes.status).toBe(200);
  });
});

// ==================== 装配管理 ====================
describe('装配管理 /api/production/assembly', () => {
  test('应返回装配任务列表', async () => {
    const res = await api.get('/api/production/assembly/stations');

    expect(res.status).toBe(200);
  });
});

// ==================== 批次追溯 ====================
describe('批次追溯 /api/batch-traceability', () => {
  test('追溯查询需要参数（无参数应返回400+）', async () => {
    // 追溯接口需要 materialCode 和 batchNumber 参数
    const res = await api.get('/api/batch-traceability/unified');

    // 缺少参数应返回 400/422
    expect([400, 422]).toContain(res.status);
  });
});

// ==================== 追溯监控 ====================
describe('追溯监控 /api/traceability-monitor', () => {
  test('应返回追溯监控数据', async () => {
    const res = await api.get('/api/traceability-monitor/overview');

    expect(res.status).toBe(200);
  });
});

// ==================== 合同管理 ====================
describe('合同管理 /api/contracts', () => {
  test('应返回合同列表', async () => {
    const res = await api.get('/api/contracts?page=1&pageSize=5');

    expect(res.status).toBe(200);
  });
});

// ==================== 待办事项 ====================
describe('待办事项 /api/todos', () => {
  test('应返回待办列表', async () => {
    const res = await api.get('/api/todos');

    expect(res.status).toBe(200);
  });
});

// ==================== 金属价格 ====================
describe('金属价格 /api/metal-prices', () => {
  test('应返回金属价格列表', async () => {
    const res = await api.get('/api/metal-prices');

    expect(res.status).toBe(200);
  });
});

// ==================== 聊天 ====================
describe('聊天 /api/chat', () => {
  test('应返回聊天会话列表', async () => {
    const res = await api.get('/api/chat/conversations');

    expect(res.status).toBe(200);
  });
});

// ==================== 财务自动化 ====================
describe('财务自动化 /api/finance/automation', () => {
  test('财务自动化路由应可访问（仅POST端点）', async () => {
    const res = await api.get('/api/finance/automation/scheduled-tasks/status');
    expect(res.status).toBe(200);
  });
});

// ==================== 作业成本 ====================
describe('作业成本 /api/finance/activity-cost', () => {
  test('应返回作业成本数据', async () => {
    const res = await api.get('/api/finance/activity-cost/activities');

    expect(res.status).toBe(200);
  });
});

// ==================== 健康检查 ====================
describe('健康检查 /api/health', () => {
  test('应返回健康状态', async () => {
    const res = await api.get('/api/health');

    expect(res.status).toBe(200);
  });
});

// ==================== 监控 ====================
describe('系统监控 /api/monitoring', () => {
  test('应返回监控数据', async () => {
    const res = await api.get('/api/monitoring/metrics');

    expect(res.status).toBe(200);
  });
});
