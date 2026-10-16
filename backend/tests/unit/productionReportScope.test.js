jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), paginated: jest.fn(), error: jest.fn(), forbidden: jest.fn() },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  applyListScope: jest.fn(), assertAccess: jest.fn(),
}));
jest.mock('exceljs', () => ({ Workbook: jest.fn().mockImplementation(() => ({
  addWorksheet: jest.fn().mockReturnValue({ addRows: jest.fn() }),
  xlsx: { write: jest.fn().mockResolvedValue() },
})) }));

const { pool } = require('../../src/config/db');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const controller = require('../../src/controllers/business/production/reportController');
const scope = { join: ' JOIN departments report_scope ON report_scope.name = pt.manager',
  where: ' AND report_scope.id = ?', params: [25] };

beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.applyListScope.mockResolvedValue(scope);
  ScopeGuard.assertAccess.mockResolvedValue(true);
  pool.query.mockResolvedValue([[{ count: 0, total: 0, task_count: 0 }]]);
});

test.each([
  ['getReportSummary', 1], ['getReportDetail', 2], ['exportReport', 1], ['getReportStatistics', 3],
])('%s limits every query, total and aggregate to permitted production tasks', async (method, count) => {
  const req = { query: { startDate: '2026-10-01', endDate: '2026-10-14' }, user: { id: 7 } };
  const res = { setHeader: jest.fn(), end: jest.fn() };
  await controller[method](req, res);
  expect(ResponseHandler.error).not.toHaveBeenCalled();
  expect(ScopeGuard.applyListScope).toHaveBeenCalledWith(req, 'production_task', {
    tableAlias: 'pt', ownerAlias: 'production_report_task_owner_scope', accessMode: 'read',
  });
  expect(pool.query).toHaveBeenCalledTimes(count);
  for (const [sql, params] of pool.query.mock.calls) {
    expect(sql).toContain(scope.join);
    expect(sql).toContain('DATE(pr.report_time) >= ? AND DATE(pr.report_time) <= ? AND report_scope.id = ?');
    expect(params).toEqual(['2026-10-01', '2026-10-14', 25]);
  }
});

test.each(['getReportSummary', 'getReportDetail', 'exportReport'])(
  '%s rejects explicitly requested tasks outside the caller scope', async (method) => {
    ScopeGuard.assertAccess.mockResolvedValue(false);
    await controller[method]({ query: { taskId: 99 }, user: { id: 7 } }, {});
    expect(ResponseHandler.forbidden).toHaveBeenCalled();
    expect(pool.query).not.toHaveBeenCalled();
  }
);

test('unfiltered requests apply department isolation before pagination', async () => {
  await controller.getReportDetail({ query: { page: 2, pageSize: 5 }, user: { id: 7 } }, {});
  for (const [sql, params] of pool.query.mock.calls) {
    expect(sql).toContain('WHERE 1 = 1 AND report_scope.id = ?');
    expect(params).toEqual([25]);
  }
  expect(pool.query.mock.calls[1][0]).toMatch(/report_scope.id = \?[\s\S]*LIMIT 5 OFFSET 5/);
});

test('unrestricted users retain normal reporting', async () => {
  ScopeGuard.applyListScope.mockResolvedValue({ join: '', where: '', params: [] });
  await controller.getReportSummary({ query: {}, user: { id: 1 } }, {});
  expect(pool.query.mock.calls[0][1]).toEqual([]);
  expect(ResponseHandler.success).toHaveBeenCalled();
  expect(ResponseHandler.error).not.toHaveBeenCalled();
});
