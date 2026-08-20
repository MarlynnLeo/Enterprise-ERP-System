/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({
  pool: { getConnection: jest.fn() },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInventoryOutboundCode: jest.fn() },
}));
jest.mock('../../src/services/InventoryService', () => ({
  getBatchMaterialInfo: jest.fn(),
  getCurrentStock: jest.fn(),
  updateStock: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/inventoryConsistencyController', () => ({
  _syncProductionStatus: jest.fn(),
}));
jest.mock('../../src/utils/userUtils', () => ({
  getRequestActorLabel: jest.fn(() => 'tester'),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(),
}));
jest.mock('../../src/controllers/business/inventory/outbound/outboundHelpers', () => ({
  getMaterialInfoMap: jest.fn(),
  getTaskNetRequirementRows: jest.fn(),
  mergeRequirementRows: jest.fn(),
  normalizeIssueQuantities: jest.fn(),
  assertOutboundSourceAccess: jest.fn(),
}));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const { assertOutboundSourceAccess } = require('../../src/controllers/business/inventory/outbound/outboundHelpers');
const {
  batchOutbound,
  supplementOutbound,
} = require('../../src/controllers/business/inventory/outbound/outboundBomController');

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

function supplementRequest(referenceType = 'production_task') {
  return {
    params: { id: '9' },
    body: {
      items: [{ outbound_item_id: 21, material_id: 7, quantity: 2 }],
      remark: '补发测试',
    },
    user: { id: 3, username: 'tester' },
    userPermissions: ['inventory:outbound:update'],
    referenceType,
  };
}

describe('outbound BOM authorization and atomic supplement', () => {
  let connection;

  beforeEach(() => {
    jest.clearAllMocks();
    connection = connectionDouble();
    db.pool.getConnection.mockResolvedValue(connection);
    ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
    assertOutboundSourceAccess.mockResolvedValue(true);
  });

  test.each(['production_task', 'production_plan'])(
    '补发来源 %s 越权时返回403且不读取明细或扣库存',
    async (referenceType) => {
      connection.execute.mockResolvedValueOnce([[
        {
          id: 9,
          outbound_no: 'OUT-9',
          status: 'partial_completed',
          reference_type: referenceType,
          reference_id: 77,
        },
      ]]);
      assertOutboundSourceAccess.mockResolvedValue(false);
      const res = responseDouble();

      await supplementOutbound(supplementRequest(referenceType), res);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(connection.execute).toHaveBeenCalledTimes(1);
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(InventoryService.getBatchMaterialInfo).not.toHaveBeenCalled();
      expect(InventoryService.updateStock).not.toHaveBeenCalled();
    }
  );

  test('补发明细并发更新 affectedRows=0 时整事务回滚且不扣库存', async () => {
    connection.execute
      .mockResolvedValueOnce([[
        {
          id: 9,
          outbound_no: 'OUT-9',
          status: 'partial_completed',
          reference_type: 'production_task',
          reference_id: 77,
        },
      ]])
      .mockResolvedValueOnce([[
        {
          id: 21,
          outbound_id: 9,
          material_id: 7,
          shortage_quantity: 3,
          material_code: 'M-7',
          material_name: '物料7',
        },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]);
    InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([
      [7, { locationId: 5, code: 'M-7', name: '物料7' }],
    ]));
    InventoryService.getCurrentStock.mockResolvedValue(20);
    const res = responseDouble();

    await supplementOutbound(supplementRequest(), res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json.mock.calls.at(-1)[0]).toMatchObject({
      errorCode: 'OUTBOUND_SUPPLEMENT_CONFLICT',
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });

  test('批量发料混入越权来源任务时整批失败且无数据库写入', async () => {
    assertOutboundSourceAccess.mockResolvedValue(false);
    const res = responseDouble();
    const req = {
      body: { task_ids: [1, 2], outbound_date: '2026-08-19' },
      user: { id: 3 },
    };

    await batchOutbound(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test('批量发料任务超过500条时在事务和授权查询前拒绝', async () => {
    const res = responseDouble();
    const req = {
      body: { task_ids: Array.from({ length: 501 }, (_, index) => index + 1) },
      user: { id: 3 },
    };

    await batchOutbound(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(connection.beginTransaction).not.toHaveBeenCalled();
    expect(assertOutboundSourceAccess).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
  });
});
