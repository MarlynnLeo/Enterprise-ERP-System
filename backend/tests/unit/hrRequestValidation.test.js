/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { query: jest.fn(), getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { success: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/business/hr/salaryService', () => ({}));
jest.mock('../../src/services/business/hr/dingtalkSyncService', () => ({}));
jest.mock('../../src/services/business/WorkflowService', () => ({
  tryStartWorkflow: jest.fn().mockResolvedValue({ instanceId: 91 }),
}));

const { pool } = require('../../src/config/db');
const { ResponseHandler } = require('../../src/utils/responseHandler');
const WorkflowService = require('../../src/services/business/WorkflowService');
const controller = require('../../src/controllers/business/hr/hrController');

describe('HR request input and approval transaction', () => {
  let connection;
  const request = (body) => ({ body, user: { id: 7 } });
  const leave = () => ({
    leaveType: '事假', startDate: '2026-09-18', endDate: '2026-09-19', duration: 2, reason: '个人事务',
  });
  const overtime = () => ({
    overtimeDate: '2026-09-18', overtimeType: '工作日加班', hours: 2, reason: '生产安排',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    connection = {
      beginTransaction: jest.fn().mockResolvedValue(),
      query: jest.fn().mockResolvedValue([{ insertId: 31 }]),
      commit: jest.fn().mockResolvedValue(),
      rollback: jest.fn().mockResolvedValue(),
      release: jest.fn(),
    };
    pool.query.mockResolvedValue([[{ id: 12 }]]);
    pool.getConnection.mockResolvedValue(connection);
    WorkflowService.tryStartWorkflow.mockResolvedValue({ instanceId: 91 });
  });

  test('accepts camelCase leave fields and starts approval in the same transaction', async () => {
    await controller.createLeaveRequest(request(leave()), {});
    expect(connection.query.mock.calls[0]?.[1].slice(1, 8)).toEqual([
      7, 12, '事假', '2026-09-18', '2026-09-19', 2, '个人事务',
    ]);
    expect(WorkflowService.tryStartWorkflow.mock.calls[0]?.[5]).toBe(connection);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each([
    { ...overtime() },
    { overtime_date: '2026-09-18', overtime_type: '工作日加班', hours: 2, reason: '生产安排' },
    { date: '2026-09-18', type: '工作日加班', hours: 2, reason: '生产安排' },
  ])('accepts overtime input at the HTTP boundary: %j', async (body) => {
    await controller.createOvertimeRequest(request(body), {});
    expect(connection.query.mock.calls[0]?.[1].slice(1, 9)).toEqual([
      7, 12, '2026-09-18', null, null, 2, '工作日加班', '生产安排',
    ]);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each(['invalid', '2026-02-30', '2026-13-01'])('rejects invalid leave dates before inserting: %s', async (startDate) => {
    await controller.createLeaveRequest(request({ ...leave(), type: '事假', startDate }), {});
    expect(ResponseHandler.error.mock.calls[0]?.slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test.each(['invalid', '2026-02-30', '2026-13-01'])('rejects invalid overtime dates before inserting: %s', async (date) => {
    await controller.createOvertimeRequest(request({ ...overtime(), date, type: '工作日加班' }), {});
    expect(ResponseHandler.error.mock.calls[0]?.slice(2, 4)).toEqual(['VALIDATION_ERROR', 400]);
    expect(pool.getConnection).not.toHaveBeenCalled();
  });

  test('rolls back a request when approval cannot start', async () => {
    WorkflowService.tryStartWorkflow.mockRejectedValueOnce(new Error('审批模板不存在'));
    await controller.createLeaveRequest(request({ ...leave(), type: '事假' }), {});
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });
});
