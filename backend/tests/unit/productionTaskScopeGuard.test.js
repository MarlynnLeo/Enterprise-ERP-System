/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/services/DataScopeService', () => ({
  buildRequestOwnerScopeClause: jest.fn(),
  assertRecordExists: jest.fn(),
  assertRecordAccess: jest.fn(),
}));
jest.mock('../../src/authorization/ProductionTaskScope', () => ({
  buildRequestClause: jest.fn(),
  assertAccess: jest.fn(),
}));
jest.mock('../../src/utils/responseHandler', () => ({
  ResponseHandler: { forbidden: jest.fn() },
}));

const DataScopeService = require('../../src/services/DataScopeService');
const ProductionTaskScope = require('../../src/authorization/ProductionTaskScope');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { ResponseHandler } = require('../../src/utils/responseHandler');

const emptyScope = { join: '', where: '', params: [] };
const departmentScope = { join: '', where: ' AND task_department = ?', params: [25] };
const req = { user: { id: 7 }, authzScope: { type: 1, userId: 7 } };
const conn = {};

beforeEach(() => {
  jest.resetAllMocks();
  DataScopeService.buildRequestOwnerScopeClause.mockResolvedValue(emptyScope);
  DataScopeService.assertRecordExists.mockResolvedValue(true);
  DataScopeService.assertRecordAccess.mockResolvedValue(true);
  ProductionTaskScope.buildRequestClause.mockResolvedValue(departmentScope);
  ProductionTaskScope.assertAccess.mockResolvedValue(true);
});

describe('production task ScopeGuard integration', () => {
  test('shared reads still require the workshop restriction despite role ALL scope', async () => {
    const options = { tableAlias: 'pt', accessMode: 'read' };

    await expect(ScopeGuard.applyListScope(req, 'production_task', options)).resolves.toEqual(departmentScope);

    expect(ProductionTaskScope.buildRequestClause).toHaveBeenCalledWith(req, options);
    expect(DataScopeService.buildRequestOwnerScopeClause).not.toHaveBeenCalled();
  });

  test('ALL owner scope still retains the workshop restriction for writes', async () => {
    await expect(ScopeGuard.applyListScope(req, 'production_task', { tableAlias: 'pt' }))
      .resolves.toEqual(departmentScope);

    expect(DataScopeService.buildRequestOwnerScopeClause).toHaveBeenCalledWith(req,
      expect.objectContaining({ tableAlias: 'pt', ownerColumn: 'created_by' }));
  });

  test('restricted writes intersect existing owner scope with the workshop scope', async () => {
    const ownerScope = {
      join: ' JOIN users task_owner ON task_owner.id = pt.created_by',
      where: ' AND task_owner.id = ?',
      params: [7],
    };
    DataScopeService.buildRequestOwnerScopeClause.mockResolvedValue(ownerScope);
    const selfReq = { user: { id: 7 }, authzScope: { type: 4, userId: 7 } };

    await expect(ScopeGuard.applyListScope(selfReq, 'production_task', { tableAlias: 'pt' }))
      .resolves.toEqual({
        join: ownerScope.join,
        where: ' AND task_owner.id = ? AND task_department = ?',
        params: [7, 25],
      });
  });

  test.each([{ accessMode: 'read' }, {}])('cross-department records are rejected before shared or ALL access: %j', async (options) => {
    ProductionTaskScope.assertAccess.mockResolvedValue(false);
    const res = {};

    await expect(ScopeGuard.denyUnlessAccess(res, conn, req, 'production_task', 99,
      '无权访问该生产任务', options)).resolves.toBe(false);

    expect(ProductionTaskScope.assertAccess).toHaveBeenCalledWith(conn, req, 99);
    expect(DataScopeService.assertRecordExists).not.toHaveBeenCalled();
    expect(DataScopeService.assertRecordAccess).not.toHaveBeenCalled();
    expect(ResponseHandler.forbidden).toHaveBeenCalledWith(res, '无权访问该生产任务');
  });

  test('matching workshop does not bypass owner denial on writes', async () => {
    DataScopeService.assertRecordAccess.mockResolvedValue(false);

    await expect(ScopeGuard.assertAccess(conn, req, 'production_task', 8)).resolves.toBe(false);

    expect(ProductionTaskScope.assertAccess).toHaveBeenCalledWith(conn, req, 8);
    expect(DataScopeService.assertRecordAccess).toHaveBeenCalledWith(conn, req,
      'production_tasks', 8, expect.objectContaining({ ownerColumn: 'created_by' }));
    expect(DataScopeService.assertRecordExists).not.toHaveBeenCalled();
  });

  test('matching workshop retains existing shared read and existence checks', async () => {
    DataScopeService.assertRecordExists.mockResolvedValue(false);

    await expect(ScopeGuard.assertAccess(conn, req, 'production_task', 8, { accessMode: 'read' }))
      .resolves.toBe(false);

    expect(DataScopeService.assertRecordExists).toHaveBeenCalledWith(conn, 'production_tasks', 8,
      expect.objectContaining({ deletedAtColumn: 'deleted_at' }));
    expect(DataScopeService.assertRecordAccess).not.toHaveBeenCalled();
  });

  test('an unrestricted department preserves the original owner restriction', async () => {
    ProductionTaskScope.buildRequestClause.mockResolvedValue(emptyScope);
    const ownerScope = { join: '', where: ' AND pt.created_by = ?', params: [7] };
    DataScopeService.buildRequestOwnerScopeClause.mockResolvedValue(ownerScope);

    await expect(ScopeGuard.applyListScope(req, 'production_task', { tableAlias: 'pt' }))
      .resolves.toEqual(ownerScope);
    await expect(ScopeGuard.applyListScope(req, 'production_task', { tableAlias: 'pt', accessMode: 'read' }))
      .resolves.toEqual(emptyScope);
  });

  test.each(['production_plan', 'inventory_check', 'sales_order', 'ar_invoice'])
  ('other resource policies never invoke workshop authorization: %s', async (policyKey) => {
    await ScopeGuard.applyListScope(req, policyKey, { tableAlias: 't', accessMode: 'read' });
    await ScopeGuard.assertAccess(conn, req, policyKey, 8, { accessMode: 'read' });
    await ScopeGuard.applyListScope(req, policyKey, { tableAlias: 't' });
    await ScopeGuard.assertAccess(conn, req, policyKey, 8);

    expect(ProductionTaskScope.buildRequestClause).not.toHaveBeenCalled();
    expect(ProductionTaskScope.assertAccess).not.toHaveBeenCalled();
  });

  test.each([{ accessMode: 'read' }, {}])('one forbidden workshop rejects an entire batch: %j', async (options) => {
    ProductionTaskScope.assertAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const res = {};

    await expect(ScopeGuard.denyUnlessAllAccess(res, conn, req, 'production_task', [8, 99, 10],
      '批量请求包含无权访问的生产任务', options)).resolves.toBe(false);

    expect(ProductionTaskScope.assertAccess.mock.calls.map((call) => call[2])).toEqual([8, 99]);
    expect(ResponseHandler.forbidden).toHaveBeenCalledWith(res, '批量请求包含无权访问的生产任务');
    const fallback = options.accessMode === 'read'
      ? DataScopeService.assertRecordExists : DataScopeService.assertRecordAccess;
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  test('workshop lookup errors never fall through to shared access', async () => {
    ProductionTaskScope.assertAccess.mockRejectedValue(new Error('department lookup failed'));

    await expect(ScopeGuard.assertAccess(conn, req, 'production_task', 8, { accessMode: 'read' }))
      .rejects.toThrow('department lookup failed');

    expect(DataScopeService.assertRecordExists).not.toHaveBeenCalled();
    expect(DataScopeService.assertRecordAccess).not.toHaveBeenCalled();
  });
});
