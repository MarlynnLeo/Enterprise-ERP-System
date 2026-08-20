/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn(), execute: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInventoryOutboundCode: jest.fn() },
}));
jest.mock('../../src/utils/softDelete', () => ({ softDeleteBatch: jest.fn() }));
jest.mock('../../src/services/InventoryService', () => ({ updateStock: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/utils/userHelper', () => ({ getCurrentUserName: jest.fn(() => 'tester') }));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({
  checkAndUpdateTaskStatus: jest.fn(),
  _syncProductionStatus: jest.fn(),
}));
jest.mock('../../src/utils/userUtils', () => ({
  getRequestActorLabel: jest.fn(() => 'tester'),
  resolveActorLabel: jest.fn(() => 'tester'),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(),
  denyUnlessAllAccess: jest.fn(),
  assertAccess: jest.fn(),
  assertAllAccess: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  STATUS: {
    OUTBOUND: {
      DRAFT: 'draft',
      CONFIRMED: 'confirmed',
      COMPLETED: 'completed',
      PARTIAL_COMPLETED: 'partial_completed',
      REVERSED: 'reversed',
      CANCELLED: 'cancelled',
    },
    PRODUCTION_TASK: {
      MATERIAL_ISSUED: 'material_issued',
      MATERIAL_PARTIAL_ISSUED: 'material_partial_issued',
      PREPARING: 'preparing',
    },
    PRODUCTION_PLAN: {
      MATERIAL_ISSUED: 'material_issued',
      PREPARING: 'preparing',
    },
  },
  assertOutboundSourceAccess: jest.fn(),
  isProductionOutboundReference: jest.fn(),
  issueOutboundItemFromDetail: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundBomController', () => ({
  fetchBomItemsForOutbound: jest.fn(),
  fetchBatchBomItemsForOutbound: jest.fn(),
  parseSourceTaskIds: jest.fn(() => []),
}));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { assertOutboundSourceAccess } = require('../../src/controllers/business/inventory/outbound/outboundHelpers');
const {
  batchUpdateOutboundStatus,
  batchDeleteOutbound,
  cancelOutboundReissue,
} = require('../../src/controllers/business/inventory/outbound/outboundStatusController');

function connectionDouble() {
  return {
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn(),
  };
}

function responseDouble() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

describe('outbound status batch/source authorization', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = connectionDouble();
    db.pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    ScopeGuard.denyUnlessAllAccess.mockResolvedValue(true);
    ScopeGuard.assertAccess.mockResolvedValue(true);
    ScopeGuard.assertAllAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
  });

  test.each([
    ['status', batchUpdateOutboundStatus, { ids: [1, 2], newStatus: 'confirmed' }],
    ['delete', batchDeleteOutbound, { ids: [1, 2] }],
  ])('混合合法/越权出库ID的批量%s整批失败且无业务查询或写入', async (_name, handler, body) => {
    ScopeGuard.denyUnlessAllAccess.mockImplementation(async (res) => {
      res.status(403).json({ success: false, errorCode: 'FORBIDDEN' });
      return false;
    });
    const res = responseDouble();

    await handler({ body, user: { id: 3 } }, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('批量状态变更混入越权来源单据时不执行UPDATE', async () => {
    connection.execute.mockResolvedValueOnce([[
      { id: 1, outbound_no: 'OUT-1', status: 'draft', reference_type: 'production_task', reference_id: 10 },
      { id: 2, outbound_no: 'OUT-2', status: 'draft', reference_type: 'production_task', reference_id: 20 },
    ]]);
    assertOutboundSourceAccess
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const res = responseDouble();

    await batchUpdateOutboundStatus(
      { body: { ids: [1, 2], newStatus: 'confirmed' }, user: { id: 3 } },
      res
    );

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(connection.execute.mock.calls[0][0]).toContain('SELECT id, outbound_no');
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test.each([batchUpdateOutboundStatus, batchDeleteOutbound])(
    '批量出库ID超过500条时在事务和授权前返回400',
    async (handler) => {
      const res = responseDouble();
      const body = { ids: Array.from({ length: 501 }, (_, index) => index + 1), newStatus: 'confirmed' };

      await handler({ body, user: { id: 3 } }, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(connection.beginTransaction).not.toHaveBeenCalled();
      expect(ScopeGuard.denyUnlessAllAccess).not.toHaveBeenCalled();
      expect(connection.execute).not.toHaveBeenCalled();
    }
  );

  test.each(['production_task', 'production_plan'])(
    '撤销出库关联%s越权时返回403且不冲回库存',
    async (referenceType) => {
      connection.execute.mockResolvedValueOnce([[
        {
          id: 9,
          status: 'completed',
          reference_id: 77,
          reference_type: referenceType,
          outbound_no: 'OUT-9',
          outbound_type: 'bom_issue',
        },
      ]]);
      assertOutboundSourceAccess.mockResolvedValue(false);
      const res = responseDouble();

      await cancelOutboundReissue(
        { params: { id: '9' }, body: {}, user: { id: 3 } },
        res
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(InventoryService.updateStock).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
    }
  );
});
