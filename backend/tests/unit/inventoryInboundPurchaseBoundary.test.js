jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInboundCode: jest.fn().mockResolvedValue('IN-TEST') },
}));
jest.mock('../../src/services/InventoryService', () => ({
  getMaterialInfo: jest.fn(), getCurrentStock: jest.fn(), updateStock: jest.fn(),
  getBatchMaterialInfo: jest.fn(), getMaterialLocation: jest.fn(),
}));
jest.mock('../../src/models/nonconformingProduct', () => ({}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({ validateTaskTransition: jest.fn() }));
jest.mock('../../src/services/business/DLQService', () => ({ runWithRetry: jest.fn(), registerHandler: jest.fn() }));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/PeriodValidationService', () => ({ validateInventoryTransaction: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(), tryStampOwner: jest.fn(),
}));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const PeriodValidationService = require('../../src/services/business/PeriodValidationService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const InboundTransactionService = require('../../src/services/business/InboundTransactionService');
const ProductionInboundService = require('../../src/services/business/ProductionInboundService');
const {
  createInbound, updateInbound, updateInboundStatus, createInboundFromQuality,
} = require('../../src/controllers/business/inventory/inventoryInboundController');

const legacyPurchase = () => ({
  id: 10, inbound_no: 'IN-LEGACY', inbound_date: '2026-09-20', inbound_type: 'purchase',
  reference_type: 'purchase_order', reference_id: 8, location_id: 2,
  status: 'confirmed', operator: '仓管', created_by: 1,
});
const request = (body) => ({
  params: { id: '10' }, body, user: { id: 1, username: 'warehouse', real_name: '仓管' },
  userPermissions: ['inventory:inbound:create'],
});
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const createBody = () => ({
  inboundDate: '2026-09-20', locationId: 2, operator: '仓管', status: 'draft',
  items: [{ materialId: 3, unitId: 1, quantity: 5, batchNo: 'BATCH-1' }],
});
const mockConnection = (handler = async (sql) => { throw new Error(`Unexpected SQL: ${sql}`); }) => {
  const connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(handler), query: jest.fn(handler),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  return connection;
};
const expectPurchaseRejected = (res, connection) => {
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
    success: false, message: expect.stringContaining('采购收货单'),
  }));
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/i.test(sql))).toBe(false);
  expect(InventoryService.updateStock).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  ScopeGuard.tryStampOwner.mockReturnValue({ created_by: 1 });
  PeriodValidationService.validateInventoryTransaction.mockResolvedValue({ allowed: true });
  InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([[3, { unitId: 1, locationId: 2 }]]));
});

describe('采购收货不可绕过检验流转至通用库存入库', () => {
  test.each([
    { inboundType: 'purchase' },
    { inbound_type: 'purchase' },
    { inboundType: ' Purchase ' },
    { inboundType: 'purchase_inbound' },
    { inboundType: 'other', referenceType: 'purchase_order', referenceId: 8 },
    { inboundType: 'other', referenceType: 'purchase_receipt', referenceId: 9 },
  ])('新建时拒绝采购类型和采购来源 %j', async (source) => {
    const connection = mockConnection();
    const res = response();
    await createInbound(request({ ...createBody(), ...source }), res);
    expectPurchaseRejected(res, connection);
  });

  test.each([
    ['other', { inboundType: 'purchase' }],
    ['other', { inbound_type: 'purchase' }],
    ['other', { referenceType: 'purchase_order', referenceId: 8 }],
    ['purchase', { inboundType: 'other', referenceType: null }],
  ])('编辑 %s 单据不能引入采购或把历史采购改名绕过校验', async (type, change) => {
    const existing = { ...legacyPurchase(), inbound_type: type, reference_type: null };
    const connection = mockConnection(async (sql) => {
      if (/FROM inventory_inbound\b/.test(sql)) return [[existing]];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const res = response();
    await updateInbound(request({ ...createBody(), ...change }), res);
    expectPurchaseRejected(res, connection);
  });

  test.each(['confirmed', 'completed'])('历史采购通用入库单不能流转为 %s', async (status) => {
    const connection = mockConnection(async () => [[{ ...legacyPurchase(), status: 'draft' }]]);
    const res = response();
    await updateInboundStatus(request({ newStatus: status }), res);
    expectPurchaseRejected(res, connection);
  });

  test('历史采购通用入库单仍允许取消', async () => {
    const connection = mockConnection(async (sql) => {
      if (/FROM inventory_inbound\b/.test(sql)) return [[legacyPurchase()]];
      if (/UPDATE inventory_inbound SET status/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const res = response();
    await updateInboundStatus(request({ newStatus: 'cancelled' }), res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });

  test('来料检验单不能通过 from-quality 另建通用入库单', async () => {
    const connection = mockConnection(async (sql) => {
      if (/FROM quality_inspections/.test(sql)) return [[{
        id: 7, inspection_type: 'incoming', status: 'passed', qualified_quantity: 5,
        reference_id: 8, inspection_no: 'IQC-7',
      }]];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const res = response();
    await createInboundFromQuality(request({ ...createBody(), inspectionId: 7 }), res);
    expectPurchaseRejected(res, connection);
  });

  test('领域完成入口检查数据库来源，不信任调用方把采购类型改成其他', async () => {
    const connection = mockConnection(async () => [[legacyPurchase()]]);
    await expect(InboundTransactionService.confirmInbound(
      connection, 10, '仓管', { inbound_type: 'other' }, 1
    )).rejects.toMatchObject({ errorCode: 'PURCHASE_RECEIPT_REQUIRED', httpStatus: 400 });
    expect(connection.execute).toHaveBeenCalledTimes(1);
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  });

  test('普通其他入库草稿仍可正常创建', async () => {
    const connection = mockConnection(async (sql) => {
      if (/INSERT INTO inventory_inbound\b/.test(sql)) return [{ insertId: 10 }];
      if (/INSERT INTO inventory_inbound_items/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const res = response();
    await createInbound(request({ ...createBody(), inboundType: 'other' }), res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });
});

describe('生产终检仅生成生产任务的入库单', () => {
  test('不存在的生产任务不能回退查找同编号采购订单', async () => {
    const connection = mockConnection(async (sql) => {
      if (/FROM inventory_inbound\b|FROM production_tasks/.test(sql)) return [[]];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(ProductionInboundService.createDraftFromFinalInspection(connection, {
      inspection: { id: 7, inspection_type: 'final', reference_id: 8 },
    })).rejects.toMatchObject({ httpStatus: 400, message: expect.stringContaining('有效生产任务') });
    expect(connection.query.mock.calls.some(([sql]) => /purchase_orders/.test(sql))).toBe(false);
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('明确采购来源即使恰有同编号生产任务也不能被当成生产入库', async () => {
    const connection = mockConnection();
    await expect(ProductionInboundService.createDraftFromFinalInspection(connection, {
      inspection: { id: 7, inspection_type: 'final', reference_type: 'purchase_order', reference_id: 8 },
    })).rejects.toMatchObject({ httpStatus: 400, message: expect.stringContaining('采购收货单') });
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test('正常生产终检仍生成生产任务入库草稿', async () => {
    const connection = mockConnection(async (sql) => {
      if (/FROM inventory_inbound\b/.test(sql)) return [[]];
      if (/FROM production_tasks/.test(sql)) return [[{
        id: 8, code: 'PT-8', product_id: 3, material_location_id: 2, material_unit_id: 1,
      }]];
      if (/FROM locations/.test(sql)) return [[{ id: 2 }]];
      if (/INSERT INTO inventory_inbound\b/.test(sql)) return [{ insertId: 10 }];
      if (/INSERT INTO inventory_inbound_items/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(ProductionInboundService.createDraftFromFinalInspection(connection, {
      inspection: {
        id: 7, inspection_no: 'FQC-7', inspection_type: 'final', reference_type: 'production_task',
        reference_id: 8, qualified_quantity: 5, batch_no: 'BATCH-1', inspector_id: 1,
      },
    })).resolves.toMatchObject({ created: true, id: 10, task_id: 8 });
    const header = connection.execute.mock.calls.find(([sql]) => /INSERT INTO inventory_inbound\b/.test(sql));
    expect(header[1].slice(1, 4)).toEqual(['production', 'production_task', 8]);
  });
});
