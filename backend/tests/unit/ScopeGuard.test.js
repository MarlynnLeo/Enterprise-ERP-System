/**
 * ScopeGuard + resourcePolicies：行级范围 + 财务共享 + sharedRead。
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
}));

const DataScopeService = require('../../src/services/DataScopeService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { getResourcePolicy, listResourcePolicyKeys } = require('../../src/authorization/resourcePolicies');

describe('resourcePolicies', () => {
  test('注册表包含核心业务资源', () => {
    const keys = listResourcePolicyKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        'sales_order',
        'sales_outbound',
        'sales_return',
        'sales_quotation',
        'sales_exchange',
        'purchase_order',
        'purchase_requisition',
        'purchase_receipt',
        'purchase_return',
        'inventory_outbound',
        'inventory_inbound',
        'inventory_transfer',
        'inventory_check',
        'production_task',
        'quality_inspection',
        'ar_invoice',
        'ap_invoice',
        'ar_receipt',
        'ap_payment',
        'gl_entry',
        'expense',
        'bank_transaction',
        'cash_transaction',
      ])
    );
  });

  test('资源仍声明表、创建归属和软删字段用于创建/审计/存在性校验', () => {
    const ar = getResourcePolicy('ar_invoice');
    expect(ar.table).toBe('ar_invoices');
    expect(ar.ownerColumn).toBe('created_by');
    expect(ar.deletedAtColumn).toBe(false);

    const productionPlan = getResourcePolicy('production_plan');
    expect(productionPlan.departmentColumn).toBe('department_id');
  });

  test('未知策略抛错', () => {
    expect(() => getResourcePolicy('not_exist')).toThrow(/Unknown resource policy/);
  });
});

describe('DataScopeService fail-closed', () => {
  test('无认证身份不是 ALL 且列表条件拒绝', () => {
    expect(DataScopeService.isAllScope(null)).toBe(false);
    expect(DataScopeService.isAllScope(undefined)).toBe(false);
    expect(DataScopeService.buildOwnerScopeClause(null, { tableAlias: 't' }).where).toContain(
      '1 = 0'
    );
  });
});

describe('ScopeGuard', () => {
  const selfScopeReq = {
    authzScope: {
      type: DataScopeService.DATA_SCOPE.SELF,
      userId: 9,
      departmentIds: [2],
      locationIds: [3],
    },
  };

  test('财务共享资源列表不追加行级条件', async () => {
    await expect(
      ScopeGuard.applyListScope(selfScopeReq, 'ar_invoice', { tableAlias: 't' })
    ).resolves.toEqual({ join: '', where: '', params: [] });
  });

  test('sharedRead 仅在 accessMode=read 时放开列表', async () => {
    await expect(
      ScopeGuard.applyListScope(selfScopeReq, 'sales_order', {
        tableAlias: 't',
        accessMode: 'read',
      })
    ).resolves.toEqual({ join: '', where: '', params: [] });

    const writeScope = await ScopeGuard.applyListScope(selfScopeReq, 'sales_order', {
      tableAlias: 't',
    });
    expect(writeScope.where).toContain('created_by');
    expect(writeScope.params).toEqual([9]);
  });

  test('非共享资源按 SELF 过滤创建人', async () => {
    const clause = await ScopeGuard.applyListScope(selfScopeReq, 'inventory_check', {
      tableAlias: 't',
    });
    expect(clause.where).toMatch(/created_by/);
    expect(clause.params).toEqual([9]);
  });

  test('stampOwner 仍强制记录当前创建人，忽略 body', () => {
    const req = { user: { id: 42 }, body: { created_by: 99 } };
    expect(ScopeGuard.stampOwner(req, 'sales_order')).toEqual({ created_by: 42 });
    expect(ScopeGuard.stampOwner(req, 'ar_invoice')).toEqual({ created_by: 42 });
  });

  test('stampOwner 无用户抛错', () => {
    expect(() => ScopeGuard.stampOwner({}, 'sales_order')).toThrow();
  });

  test('SELF 写路径校验创建人', async () => {
    const req = {
      authzScope: {
        type: DataScopeService.DATA_SCOPE.SELF,
        userId: 7,
        departmentIds: [],
        locationIds: [],
      },
    };
    const conn = {
      execute: jest.fn().mockResolvedValue([[{ id: 1, owner_id: 7, owner_department_id: null }]]),
    };

    await expect(ScopeGuard.assertAccess(conn, req, 'inventory_check', 1)).resolves.toBe(true);
    expect(conn.execute.mock.calls[0][0]).toContain('created_by');
  });

  test('sharedRead 读路径只校验存在', async () => {
    const req = {
      authzScope: {
        type: DataScopeService.DATA_SCOPE.SELF,
        userId: 7,
        departmentIds: [],
        locationIds: [],
      },
    };
    const conn = { execute: jest.fn().mockResolvedValue([[{ id: 1 }]]) };

    await expect(
      ScopeGuard.assertAccess(conn, req, 'sales_order', 1, { accessMode: 'read' })
    ).resolves.toBe(true);
    expect(conn.execute.mock.calls[0][0]).not.toContain('created_by');
  });

  test('不存在或已软删对象仍拒绝', async () => {
    const req = { authzScope: { type: DataScopeService.DATA_SCOPE.ALL, userId: 9 } };
    const conn = { execute: jest.fn().mockResolvedValue([[]]) };

    await expect(ScopeGuard.assertAccess(conn, req, 'sales_order', 404)).resolves.toBe(false);
    await expect(ScopeGuard.assertAccess(conn, req, 'ar_invoice', 404)).resolves.toBe(false);
  });

  test('assertAllAccess 任一失败则整批拒绝', async () => {
    const req = { authzScope: { type: DataScopeService.DATA_SCOPE.ALL, userId: 9 } };
    const conn = {
      execute: jest
        .fn()
        .mockResolvedValueOnce([[{ id: 1 }]])
        .mockResolvedValueOnce([[]]),
    };
    await expect(
      ScopeGuard.assertAllAccess(conn, req, 'sales_order', [1, 2], { accessMode: 'read' })
    ).resolves.toBe(false);
  });
});
