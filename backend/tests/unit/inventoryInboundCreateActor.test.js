/* global jest, beforeEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('../../src/utils/codeGenerator', () => ({ CodeGenerators: { generateInboundCode: jest.fn().mockResolvedValue('IN-ACTOR') } }));
jest.mock('../../src/services/InventoryService', () => ({ getBatchMaterialInfo: jest.fn() }));
jest.mock('../../src/services/business/InboundTransactionService', () => ({ assertGenericInboundSource: jest.fn(), validateProductionSource: jest.fn() }));
jest.mock('../../src/services/business/ProductionReturnService', () => ({ validate: jest.fn() }));
jest.mock('../../src/services/business/FinalInspectionReleaseService', () => ({ validate: jest.fn() }));
jest.mock('../../src/services/business/PeriodValidationService', () => ({ validateInventoryTransaction: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ tryStampOwner: jest.fn(req => ({ created_by: req.user.id })) }));

const db = require('../../src/config/db');
const InventoryService = require('../../src/services/InventoryService');
const InboundTransactionService = require('../../src/services/business/InboundTransactionService');
const { createInbound } = require('../../src/controllers/business/inventory/inventoryInboundController');

// The controller uses the real HTTP mapper, identity helper and ResponseHandler.
const body = () => ({ inboundType: 'other', inboundDate: '2026-10-17', status: 'draft', locationId: 8,
  items: [{ materialId: 7, quantity: 2, unitId: 1, locationId: 8 }] });
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
let connection;
beforeEach(() => {
  jest.clearAllMocks();
  connection = {
    beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(async sql => {
      if (/INSERT INTO inventory_inbound\b/.test(sql)) return [{ insertId: 10 }];
      if (/INSERT INTO inventory_inbound_items\b/.test(sql)) return [{ affectedRows: 1 }];
      throw new Error(`Unexpected SQL: ${sql}`);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  InventoryService.getBatchMaterialInfo.mockResolvedValue(new Map([[7, { unitId: 1, locationId: 8 }]]));
});

test.each([undefined, '', '伪造的操作人', '99'])(
  'records the authenticated creator even when the client operator is %s',
  async operator => {
    const payload = body();
    if (operator !== undefined) payload.operator = operator;
    const req = { body: payload, user: { id: 42, username: 'warehouse', real_name: '真实库管' }, userPermissions: ['inventory:inbound:create'] };
    const res = response();
    await createInbound(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const insert = connection.execute.mock.calls.find(([sql]) => /INSERT INTO inventory_inbound\b/.test(sql));
    expect(insert[1][8]).toBe('真实库管');
    expect(insert[1][10]).toBe(42);
    expect(InboundTransactionService.validateProductionSource).toHaveBeenCalledWith(connection,
      expect.objectContaining({ operator: '真实库管', location_id: 8 }), expect.any(Array), req);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  }
);

test('a trusted id-only session supplies an operator without any client field', async () => {
  const res = response();
  await createInbound({ body: body(), user: { id: 42 }, userPermissions: ['inventory:inbound:create'] }, res);
  expect(res.status).toHaveBeenCalledWith(201);
  const insert = connection.execute.mock.calls.find(([sql]) => /INSERT INTO inventory_inbound\b/.test(sql));
  expect(insert[1][8]).toBe('42');
});

test('a forged body operator cannot replace missing authenticated identity', async () => {
  const res = response();
  await createInbound({ body: { ...body(), operator: '仓管' }, userPermissions: ['inventory:inbound:create'] }, res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('操作员') }));
  expect(connection.execute).not.toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledTimes(1);
});
