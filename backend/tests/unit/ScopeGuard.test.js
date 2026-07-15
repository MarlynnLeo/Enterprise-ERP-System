/**
 * ScopeGuard + resourcePolicies + DataScope 失败关闭单测
 */

jest.mock('../../src/config/db', () => ({
  pool: {
    execute: jest.fn(),
    query: jest.fn(),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
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

  test('财务资源声明 financeShared + created_by', () => {
    const ar = getResourcePolicy('ar_invoice');
    expect(ar.financeShared).toBe(true);
    expect(ar.ownerColumn).toBe('created_by');
    expect(ar.deletedAtColumn).toBe(false);
  });

  test('未知策略抛错', () => {
    expect(() => getResourcePolicy('not_exist')).toThrow(/Unknown resource policy/);
  });
});

describe('DataScopeService fail-closed', () => {
  test('null scope 不是 ALL', () => {
    expect(DataScopeService.isAllScope(null)).toBe(false);
    expect(DataScopeService.isAllScope(undefined)).toBe(false);
  });

  test('null scope 列表条件拒绝', () => {
    const clause = DataScopeService.buildOwnerScopeClause(null, { tableAlias: 't' });
    expect(clause.where).toContain('1 = 0');
  });
});

describe('ScopeGuard', () => {
  test('财务共享 all 模式 list 无过滤', async () => {
    const req = {
      authzScope: {
        type: DataScopeService.DATA_SCOPE.SELF,
        userId: 9,
        departmentIds: [],
        locationIds: [],
      },
    };
    const clause = await ScopeGuard.applyListScope(req, 'ar_invoice', { tableAlias: 'a' });
    // 默认 FINANCE_DATA_SCOPE_POLICY=all → 共享中心不按 SELF 裁剪
    expect(clause.where).toBe('');
    expect(clause.params).toEqual([]);
  });

  test('财务 stampOwner 走 ar_invoice policy', () => {
    const req = { user: { id: 11 } };
    expect(ScopeGuard.stampOwner(req, 'ar_invoice')).toEqual({ created_by: 11 });
  });

  test('stampOwner 强制当前用户，忽略 body', () => {
    const req = { user: { id: 42 } };
    const stamp = ScopeGuard.stampOwner(req, 'sales_order');
    expect(stamp).toEqual({ created_by: 42 });
  });

  test('stampOwner 无用户抛错', () => {
    expect(() => ScopeGuard.stampOwner({}, 'sales_order')).toThrow();
  });

  test('assertAccess 使用策略表', async () => {
    const req = {
      authzScope: {
        type: DataScopeService.DATA_SCOPE.SELF,
        userId: 7,
        departmentIds: [],
        locationIds: [],
      },
    };
    const conn = {
      execute: jest.fn().mockResolvedValue([[{ id: 1, owner_id: 7 }]]),
    };
    await expect(ScopeGuard.assertAccess(conn, req, 'sales_outbound', 1)).resolves.toBe(true);
    expect(conn.execute).toHaveBeenCalledWith(
      expect.stringContaining('sales_outbound'),
      expect.any(Array)
    );
  });

  test('applyListScope 生成 SELF 条件', async () => {
    const req = {
      authzScope: {
        type: DataScopeService.DATA_SCOPE.SELF,
        userId: 9,
        departmentIds: [],
        locationIds: [],
      },
    };
    const clause = await ScopeGuard.applyListScope(req, 'inventory_inbound', {
      tableAlias: 'i',
    });
    expect(clause.where).toContain('created_by');
    expect(clause.params).toEqual([9]);
  });
});
