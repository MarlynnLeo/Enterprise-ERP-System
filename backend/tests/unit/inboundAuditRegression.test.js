/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/utils/codeGenerator', () => ({
  CodeGenerators: { generateInboundCode: jest.fn().mockResolvedValue('IN-TEST') },
}));
jest.mock('../../src/services/InventoryService', () => ({
  getMaterialInfo: jest.fn(),
  getCurrentStock: jest.fn(),
  updateStock: jest.fn(),
  getBatchMaterialInfo: jest.fn(),
}));
jest.mock('../../src/models/nonconformingProduct', () => ({}));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  validateTaskTransition: jest.fn(),
}));
jest.mock('../../src/services/business/DLQService', () => ({
  runWithRetry: jest.fn(),
  registerHandler: jest.fn(),
}));
jest.mock('../../src/services/business/AsyncTaskService', () => ({}));
jest.mock('../../src/services/business/DocumentChainService', () => ({
  afterInventoryInboundConfirmed: jest.fn(),
}));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn(),
}));
jest.mock('../../src/authorization/ScopeGuard', () => ({
  denyUnlessAccess: jest.fn(),
  tryStampOwner: jest.fn(),
  assertAccess: jest.fn(),
  applyListScope: jest.fn(),
}));
const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const ScopeGuard = require('../../src/authorization/ScopeGuard');
const PeriodValidationService = require('../../src/services/business/PeriodValidationService');
const InboundTransactionService = require('../../src/services/business/InboundTransactionService');
const {
  createInbound,
  updateInbound,
  updateInboundStatus,
  getInboundDetail,
  getInboundList,
  getInboundStatistics,
} = require('../../src/controllers/business/inventory/inventoryInboundController');

const header = (changes = {}) => ({
  id: 10,
  inbound_no: 'IN-10',
  inbound_date: '2026-09-30',
  inbound_type: 'other',
  status: 'draft',
  location_id: 2,
  operator: '仓管',
  remark: '保持备注',
  ...changes,
});
const body = (changes = {}) => ({
  inboundDate: '2026-09-30',
  inboundType: 'other',
  status: 'draft',
  locationId: 2,
  operator: '仓管',
  items: [{ materialId: 3, unitId: 1, quantity: 5, batchNo: 'B1' }],
  ...changes,
});
const req = (value = {}) => ({
  params: { id: '10' },
  query: {},
  body: value,
  user: { id: 1, username: '仓管' },
  userPermissions: ['inventory:inbound:create', 'inventory:inbound:update'],
});
const res = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const connect = (handler) => {
  const conn = {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(handler),
    query: jest.fn(handler),
  };
  db.pool.getConnection.mockResolvedValue(conn);
  return conn;
};

beforeEach(() => {
  jest.clearAllMocks();
  ScopeGuard.denyUnlessAccess.mockResolvedValue(true);
  ScopeGuard.assertAccess.mockResolvedValue(true);
  ScopeGuard.tryStampOwner.mockReturnValue({ created_by: 1 });
  ScopeGuard.applyListScope.mockResolvedValue({ join: '', where: '', params: [] });
  PeriodValidationService.validateInventoryTransaction.mockResolvedValue({ allowed: true });
  InventoryService.getBatchMaterialInfo.mockResolvedValue(
    new Map([[3, { unitId: 1, locationId: 2 }]])
  );
});

test('manual production inbound must reference an accessible task and its product', async () => {
  const conn = connect(async () => [[{ id: 7, product_id: 9, quantity: 10 }]]);
  const missing = res();
  await createInbound(req(body({ inboundType: 'production' })), missing);
  expect(missing.status).toHaveBeenCalledWith(400);
  expect(conn.execute).not.toHaveBeenCalled();
  const mismatch = res();
  await createInbound(
    req(body({ inboundType: 'production', referenceType: 'production_task', referenceId: 7 })),
    mismatch
  );
  expect(mismatch.status).toHaveBeenCalledWith(400);
  expect(mismatch.json).toHaveBeenCalledWith(
    expect.objectContaining({ message: expect.stringContaining('关联任务的产品') })
  );
  expect(ScopeGuard.assertAccess).toHaveBeenCalledWith(
    conn,
    expect.anything(),
    'production_task',
    7
  );
  expect(conn.commit).not.toHaveBeenCalled();
});

test('shop-floor return draft can await warehouse batch selection without reserving capacity', async () => {
  const conn = connect(async (sql) => {
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 9 }]];
    if (/INSERT INTO inventory_inbound\b/.test(sql)) return [{ insertId: 10 }];
    if (/INSERT INTO inventory_inbound_items/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL ${sql}`);
  });
  const response = res();
  const request = req(
    body({
      inboundType: 'production_return',
      referenceType: 'production_task',
      referenceId: 7,
      items: [{ materialId: 3, unitId: 1, quantity: 5 }],
    })
  );
  request.userPermissions = ['production:process:update'];
  await createInbound(request, response);
  expect(response.status).toHaveBeenCalledWith(201);
  expect(conn.commit).toHaveBeenCalledTimes(1);
  expect(InventoryService.updateStock).not.toHaveBeenCalled();
});

test('new confirmed return cannot exclude a prior return by supplying a body id', async () => {
  const conn = connect(async (sql, params) => {
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 9 }]];
    if (/FROM \(/.test(sql))
      return [[{ material_id: 3, location_id: 2, batch_number: 'B1', issued_quantity: 10 }]];
    if (/FROM inventory_inbound i JOIN/.test(sql)) {
      expect(params[0]).toBe(0);
      return [[{ material_id: 3, location_id: 2, batch_number: 'B1', returned_quantity: 10 }]];
    }
    throw new Error(`Unexpected SQL ${sql}`);
  });
  const response = res();
  await createInbound(
    req(
      body({
        id: 99,
        status: 'confirmed',
        inboundType: 'production_return',
        referenceType: 'production_task',
        referenceId: 7,
      })
    ),
    response
  );
  expect(response.status).toHaveBeenCalledWith(400);
  expect(conn.commit).not.toHaveBeenCalled();
});

test('changing a draft production task persists source and details together', async () => {
  const conn = connect(async (sql) => {
    if (sql.includes('SELECT ii.quantity')) return [[]];
    if (sql.includes('FROM nonconforming_products') || sql.includes('FROM production_processes') || sql.includes("inspection_type IN ('first_article'")) return [[]];
    if (sql.includes('FROM quality_inspections')) return [[{ id: 9, inspection_no: 'FQC-9', inspection_type: 'final', status: 'passed', task_id: 7, quantity: 10, qualified_quantity: 10, unqualified_quantity: 0, product_id: 3, batch_no: 'B1' }]];
    if (/FROM inventory_inbound\b/.test(sql))
      return [
        [
          header({
            inbound_type: 'production',
            reference_type: 'production_task',
            reference_id: 6,
          }),
        ],
      ];
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 3, quantity: 10, status: 'inspection', completed_quantity: 10 }]];
    return [{ affectedRows: 1 }];
  });
  const response = res();
  await updateInbound(
    req(body({ inboundType: 'production', inspectionId: 9, referenceType: 'production_task', referenceId: 7 })),
    response
  );
  expect(response.status).toHaveBeenCalledWith(200);
  const update = conn.execute.mock.calls.find(([sql]) => /UPDATE inventory_inbound\b/.test(sql));
  expect(update[1]).toEqual([
    '2026-09-30',
    'production',
    'production_task',
    7,
    null,
    2,
    'draft',
    '仓管',
    '保持备注',
    9, 'FQC-9',
    10,
  ]);
  expect(conn.commit).toHaveBeenCalled();
  expect(InventoryService.updateStock).not.toHaveBeenCalled();
});

test('quality-generated documents preserve their inspection and source association', async () => {
  const conn = connect(async () => [
    [
      header({
        inbound_type: 'production',
        reference_type: 'production_task',
        reference_id: 6,
        inspection_id: 8,
      }),
    ],
  ]);
  const response = res();
  await updateInbound(
    req(body({ inboundType: 'production', referenceType: 'production_task', referenceId: 7 })),
    response
  );
  expect(response.status).toHaveBeenCalledWith(400);
  expect(conn.execute).toHaveBeenCalledTimes(1);
});

test.each(['confirmed', 'completed'])(
  'return %s enforces cumulative quantity before inventory mutation',
  async (status) => {
    const current = header({
      inbound_type: 'production_return',
      reference_type: 'production_task',
      reference_id: 7,
      status: status === 'confirmed' ? 'draft' : 'confirmed',
    });
    const conn = connect(async (sql) => {
      if (/FROM inventory_inbound_items/.test(sql))
        return [[{ id: 30, material_id: 3, location_id: 2, quantity: 6, batch_number: 'B1' }]];
      if (/FROM inventory_inbound i JOIN/.test(sql))
        return [[{ material_id: 3, location_id: 2, batch_number: 'B1', returned_quantity: 15 }]];
      if (/FROM inventory_inbound\b/.test(sql)) return [[current]];
      if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
      if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 9 }]];
      if (/FROM \(/.test(sql))
        return [
          [
            {
              material_id: 3,
              location_id: 2,
              batch_number: 'B1',
              issued_quantity: 20,
              unit_cost: 5,
            },
          ],
        ];
      throw new Error(`Unexpected SQL ${sql}`);
    });
    const response = res();
    await updateInboundStatus(req({ newStatus: status }), response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('可退上限 5') })
    );
    expect(conn.rollback).toHaveBeenCalled();
    expect(conn.commit).not.toHaveBeenCalled();
    expect(InventoryService.updateStock).not.toHaveBeenCalled();
  }
);

test('production completion checks authoritative product even for direct service callers', async () => {
  const conn = connect(async (sql) => {
    if (/FROM inventory_inbound_items/.test(sql)) return [[{ material_id: 3, quantity: 1 }]];
    if (/FROM inventory_inbound\b/.test(sql))
      return [
        [
          header({
            inbound_type: 'production',
            reference_type: 'production_task',
            reference_id: 7,
          }),
        ],
      ];
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 9 }]];
    throw new Error(`Unexpected SQL ${sql}`);
  });
  await expect(
    InboundTransactionService.confirmInbound(conn, 10, '仓管', { inbound_type: 'other' }, 1)
  ).rejects.toMatchObject({ httpStatus: 400, message: expect.stringContaining('关联任务的产品') });
  expect(InventoryService.updateStock).not.toHaveBeenCalled();
});

test('valid return stages its source batch, warehouse and proven issue cost', async () => {
  const current = header({
    inbound_type: 'production_return',
    reference_type: 'production_task',
    reference_id: 7,
    status: 'confirmed',
  });
  const conn = connect(async (sql) => {
    if (/FROM inventory_inbound_items/.test(sql))
      return [
        [{ id: 30, material_id: 3, location_id: 2, unit_id: 1, quantity: 5, batch_number: 'B1' }],
      ];
    if (/FROM inventory_inbound i JOIN/.test(sql))
      return [[{ material_id: 3, location_id: 2, batch_number: 'B1', returned_quantity: 15 }]];
    if (/FROM inventory_inbound\b/.test(sql)) return [[current]];
    if (/FROM inventory_posting_documents reversal/.test(sql)) return [[]];
    if (/FROM production_tasks(?! guard_task)/.test(sql)) return [[{ id: 7, product_id: 9 }]];
    if (/FROM \(/.test(sql))
      return [
        [{ material_id: 3, location_id: 2, batch_number: 'B1', issued_quantity: 20, unit_cost: 8 }],
      ];
    if (/UPDATE inventory_inbound SET status/.test(sql)) return [{ affectedRows: 1 }];
    throw new Error(`Unexpected SQL ${sql}`);
  });
  InventoryService.getMaterialInfo.mockResolvedValue({ unitId: 1, locationId: 99, costPrice: 1 });
  InventoryService.getCurrentStock.mockResolvedValue(10);
  const response = res();
  await updateInboundStatus(req({ newStatus: 'completed' }), response);
  expect(response.status).toHaveBeenCalledWith(200);
  expect(InventoryService.updateStock).toHaveBeenCalledWith(
    expect.objectContaining({
      materialId: 3,
      locationId: 2,
      batchNumber: 'B1',
      quantity: 5,
      unitCost: 8,
      transactionType: 'production_return',
      idempotencyKey: 'inbound_confirm:IN-10:item:30',
    }),
    conn
  );
  expect(conn.commit).toHaveBeenCalledTimes(1);
});

test('list and statistics apply the same status filter', async () => {
  const conn = connect(async (sql) => (/COUNT\(\*\)/.test(sql) ? [[{ total: 0 }]] : [[]]));
  const request = { ...req(), query: { status: 'confirmed', inboundType: 'other' } };
  await getInboundList(request, res());
  await getInboundStatistics(request, res());
  for (const [sql, values] of conn.execute.mock.calls) {
    expect(sql).toContain('AND i.status = ?');
    expect(values).toEqual(['other', 'confirmed']);
  }
});

test('business detail includes latest finance status without exposing posting amounts', async () => {
  const conn = connect(async (sql) =>
    /FROM inventory_inbound_items/.test(sql)
      ? [[]]
      : [[header({ finance_status: 'rejected', inspection_id: 8 })]]
  );
  const response = res();
  await getInboundDetail(req(), response);
  expect(response.json).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ financeStatus: 'rejected', inspectionId: 8 }),
    })
  );
  expect(conn.execute.mock.calls[0][0]).toContain("posting.posting_kind = 'movement'");
  expect(conn.execute.mock.calls[0][0]).toContain(
    'ORDER BY posting.posting_sequence DESC, posting.id DESC'
  );
});
