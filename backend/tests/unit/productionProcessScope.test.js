/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: {
    paginated: jest.fn(), success: jest.fn(), error: jest.fn(), forbidden: jest.fn(),
  },
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  applyListScope: jest.fn(), assertAccess: jest.fn(),
}));
jest.mock('../../src/services/business/ProductProcessExecutionService', () => ({}));

const { pool } = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const {
  getProcesses, getProcessById, getProcessCompletionRates,
} = require('../../src/controllers/business/production/processController');

const restrictedScope = {
  join: ' JOIN departments task_scope ON task_scope.name = pt.manager',
  where: ' AND task_scope.id = ?',
  params: [25],
};

beforeEach(() => {
  jest.clearAllMocks();
  pool.query.mockReset();
  ScopeGuard.applyListScope.mockResolvedValue(restrictedScope);
  ScopeGuard.assertAccess.mockResolvedValue(true);
});

describe('production process department visibility', () => {
  test('unfiltered process requests scope both page rows and total before pagination', async () => {
    const req = { query: { status: 'in_progress', page: 2, pageSize: 5 }, user: { id: 7 } };
    const res = {};
    const rows = [{ id: 11, task_id: 8, process_name: '装配' }];
    pool.query.mockResolvedValueOnce([[{ count: 6 }]]).mockResolvedValueOnce([rows]);

    await getProcesses(req, res);

    expect(ScopeGuard.applyListScope).toHaveBeenCalledWith(req, 'production_task', {
      tableAlias: 'pt', ownerAlias: 'production_process_task_owner_scope', accessMode: 'read',
    });
    expect(pool.query).toHaveBeenCalledTimes(2);
    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toContain(restrictedScope.join);
      expect(sql).toContain('WHERE pt.deleted_at IS NULL AND pp.status = ? AND task_scope.id = ?');
      expect(params).toEqual(['in_progress', 25]);
    }
    expect(pool.query.mock.calls[1][0]).toMatch(/task_scope.id = \?[\s\S]*LIMIT 5 OFFSET 5/);
    expect(ResponseHandler.paginated).toHaveBeenCalledWith(res, rows, 6, 2, 5, undefined, { items: rows });
  });

  test('a task filter cannot expose another department through the process endpoint', async () => {
    ScopeGuard.assertAccess.mockResolvedValue(false);
    const req = { query: { taskId: '99' }, user: { id: 7 } };
    const res = {};

    await getProcesses(req, res);

    expect(ScopeGuard.assertAccess).toHaveBeenCalledWith(pool, req, 'production_task', '99', {
      accessMode: 'read',
    });
    expect(ResponseHandler.forbidden).toHaveBeenCalledWith(res, '无权访问该生产任务');
    expect(pool.query).not.toHaveBeenCalled();
    expect(ResponseHandler.paginated).not.toHaveBeenCalled();
  });

  test('a permitted task preserves task and status filters alongside its department scope', async () => {
    const req = { query: { taskId: '8', status: 'pending' }, user: { id: 7 } };
    pool.query.mockResolvedValueOnce([[{ count: 0 }]]).mockResolvedValueOnce([[]]);

    await getProcesses(req, {});

    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toContain('pp.task_id = ? AND pp.status = ? AND task_scope.id = ?');
      expect(params).toEqual(['8', 'pending', 25]);
    }
  });

  test('a process ID cannot return detail from an inaccessible task', async () => {
    ScopeGuard.assertAccess.mockResolvedValue(false);
    pool.query.mockResolvedValueOnce([[{ id: 11, task_id: 99 }]]);
    const req = { params: { id: '11' }, user: { id: 7 } };
    const res = {};

    await getProcessById(req, res);

    expect(ScopeGuard.assertAccess).toHaveBeenCalledWith(pool, req, 'production_task', 99, {
      accessMode: 'read',
    });
    expect(ResponseHandler.forbidden).toHaveBeenCalledWith(res, '无权访问该生产任务');
    expect(ResponseHandler.success).not.toHaveBeenCalled();
  });

  test('unrestricted users retain all permitted processes and normal pagination', async () => {
    ScopeGuard.applyListScope.mockResolvedValue({ join: '', where: '', params: [] });
    pool.query.mockResolvedValueOnce([[{ count: 0 }]]).mockResolvedValueOnce([[]]);

    await getProcesses({ query: {} }, {});

    for (const [sql, params] of pool.query.mock.calls) {
      expect(sql).toContain('WHERE pt.deleted_at IS NULL');
      expect(sql).not.toContain('task_scope');
      expect(params).toEqual([]);
    }
    expect(ResponseHandler.error).not.toHaveBeenCalled();
  });

  test('completion rates apply the same department filter before grouping and limiting', async () => {
    const req = { user: { id: 7 } };
    const res = {};
    const rates = [{ processName: '装配', total: 4, completed: 3, completionRate: 75 }];
    pool.query.mockResolvedValueOnce([rates]);

    await getProcessCompletionRates(req, res);

    expect(ScopeGuard.applyListScope).toHaveBeenCalledWith(req, 'production_task', {
      tableAlias: 'pt', ownerAlias: 'production_process_rates_owner_scope', accessMode: 'read',
    });
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toContain(restrictedScope.join);
    expect(sql).toMatch(/WHERE 1 = 1 AND task_scope.id = \?[\s\S]*GROUP BY pp.process_name[\s\S]*LIMIT 10/);
    expect(params).toEqual([25]);
    expect(ResponseHandler.success).toHaveBeenCalledWith(res, rates, 'Process completion rates loaded');
  });
});
