/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateReportCode: jest.fn().mockResolvedValue('R-20260905-1') },
}));
jest.mock('../../src/utils/userHelper', () => ({
  getCurrentUserName: jest.fn().mockResolvedValue('当前操作员'),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn().mockResolvedValue(true),
}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  promoteTaskToInspection: jest.fn(),
  promoteTaskToInProgress: jest.fn(),
}));

const { pool } = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { createReport, updateReport } = require('../../src/controllers/business/production/reportController');

describe('production report quantities and authenticated operator', () => {
  let connection;
  let storedReport;

  const makeRequest = (body) => ({
    body,
    params: { id: 9 },
    user: { id: 7, username: 'current-operator' },
  });
  const validBody = () => ({
    taskId: 42,
    completedQuantity: 10,
    qualifiedQuantity: 8,
    defectiveQuantity: 2,
    unqualifiedQuantity: 2,
    workHours: 1.5,
  });
  const reportWrites = () => connection.query.mock.calls.filter(([sql]) =>
    /(?:INSERT INTO|UPDATE) production_reports/.test(sql)
  );

  beforeEach(() => {
    jest.clearAllMocks();
    storedReport = { id: 9, task_id: 42, old_process_id: null, operator_id: 3, operator_name: '原报工人' };
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      commit: jest.fn().mockResolvedValue(),
      release: jest.fn(),
      query: jest.fn(async (sql) => {
        if (/INSERT INTO production_reports/.test(sql)) return [{ insertId: 9 }];
        if (/FROM production_reports WHERE id =/.test(sql)) return [[storedReport]];
        if (/FROM production_tasks/.test(sql)) return [[{ id: 42, status: 'in_progress', quantity: 100 }]];
        if (/SUM\(completed_quantity\)/.test(sql)) return [[{ total_reported: 20 }]];
        if (/FROM production_processes/.test(sql)) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };
    pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  });

  test('stores all mobile quantity fields and ignores forged operator identity', async () => {
    await createReport(makeRequest({ ...validBody(), operatorId: 999, operatorName: 'forged' }), {});

    expect(connection.commit).toHaveBeenCalledTimes(1);
    const values = reportWrites()[0][1];
    expect(values.slice(1, 6)).toEqual([42, null, null, 7, '当前操作员']);
    expect(values.slice(7, 13)).toEqual([10, 10, 8, 2, 2, 1.5]);
  });

  test('accepts the legacy snake-case report quantity and unqualified alias', async () => {
    await createReport(makeRequest({
      task_id: 42,
      report_quantity: '3',
      qualified_quantity: '2',
      unqualified_quantity: '1',
    }), {});

    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(reportWrites()[0][1].slice(7, 12)).toEqual([3, 3, 2, 1, 1]);
  });

  test('infers qualified output when an old caller sends only a completed total', async () => {
    await createReport(makeRequest({ taskId: 42, completedQuantity: 4 }), {});
    expect(reportWrites()[0][1].slice(7, 12)).toEqual([4, 4, 4, 0, 0]);
  });

  test.each([
    ['negative defect count', { defectiveQuantity: -1, unqualifiedQuantity: -1, qualifiedQuantity: 11 }],
    ['negative qualified count', { qualifiedQuantity: -1, defectiveQuantity: 11, unqualifiedQuantity: 11 }],
    ['non-finite qualified count', { qualifiedQuantity: 'NaN' }],
    ['infinite defect count', { defectiveQuantity: 'Infinity' }],
    ['non-finite unqualified alias', { unqualifiedQuantity: 'bad' }],
    ['conflicting defect aliases', { unqualifiedQuantity: 1 }],
    ['unbalanced quantities', { qualifiedQuantity: 7 }],
    ['negative work hours', { workHours: -1 }],
    ['non-finite work hours', { workHours: 'Infinity' }],
    ['non-finite completed output', { completedQuantity: 'Infinity' }],
    ['conflicting total aliases', { reportQuantity: 9 }],
  ])('rejects %s without writing a report', async (_, changes) => {
    await createReport(makeRequest({ ...validBody(), ...changes }), {});
    expect(ResponseHandler.error.mock.calls[0]?.slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(reportWrites()).toHaveLength(0);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('accepts normal decimal arithmetic without a false quantity mismatch', async () => {
    await createReport(makeRequest({
      taskId: 42,
      completedQuantity: 0.3,
      qualifiedQuantity: 0.1,
      defectiveQuantity: 0.2,
    }), {});
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test('preserves the recorded operator while updating totals and defect aliases', async () => {
    await updateReport(makeRequest({
      ...validBody(),
      completedQuantity: 12,
      qualifiedQuantity: 10,
      operatorName: 'forged editor',
    }), {});

    expect(connection.commit).toHaveBeenCalledTimes(1);
    const [sql, values] = reportWrites()[0];
    expect(sql).not.toMatch(/SET[\s\S]*operator_(?:id|name)\s*=/);
    expect(sql).toMatch(/report_quantity\s*=/);
    expect(values).not.toContain('forged editor');
    expect(values).toContain(12);
  });

  test.each([
    { defectiveQuantity: -2 },
    { unqualifiedQuantity: 'NaN' },
    { qualifiedQuantity: 9 },
    { workHours: -1 },
  ])('applies the same quantity validation to report edits: %j', async (changes) => {
    await updateReport(makeRequest({ ...validBody(), ...changes }), {});
    expect(ResponseHandler.error.mock.calls[0]?.slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(reportWrites()).toHaveLength(0);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('rejects a report outside the user scope before writing', async () => {
    ScopeGuard.denyUnlessAccess.mockResolvedValue(false);
    await createReport(makeRequest(validBody()), {});
    expect(reportWrites()).toHaveLength(0);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
