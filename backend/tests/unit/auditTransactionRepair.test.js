jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn(), execute: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/utils/userUtils', () => ({ resolveActorLabel: jest.fn(async () => 'QA') }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(async () => true) }));
const db = require('../../src/config/db');
const spc = require('../../src/controllers/business/quality/spcController');
const Ncp = require('../../src/models/nonconformingProduct');
const rules = require('../../src/config/businessRulesConfig');
const Allocation = require('../../src/services/business/ProductionIssueAllocationService');

async function record({ active = 1, size = 2, values = [1, 2], failAt = 0, duplicate = false } = {}) {
  let pending = [];
  let committed = [];
  const conn = {
    beginTransaction: jest.fn(), release: jest.fn(),
    commit: jest.fn(async () => { committed = pending; }),
    rollback: jest.fn(async () => { pending = []; }),
    query: jest.fn(async (sql, args) => {
      if (sql.includes('FROM spc_control_plans')) { expect(sql).toContain('FOR UPDATE'); return [[{ id: 1, is_active: active, subgroup_size: size }]]; }
      if (sql.includes('FROM spc_data_points')) return [duplicate ? [{ id: 1 }] : []];
      if (sql.includes('INSERT INTO spc_data_points')) {
        if (pending.length + 1 === failAt) throw new Error('write failure');
        pending.push(args); return [{ insertId: pending.length }];
      }
      throw new Error(sql);
    }),
  };
  db.pool.getConnection.mockResolvedValue(conn);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await spc.addDataPoints({ body: { planId: 1, subgroupNo: 1, samples: values.map(measuredValue => ({ measuredValue })) } }, res);
  return { conn, res, committed };
}
test.each([{ active: 0 }, { values: [1] }, { values: ['bad', 2] }, { values: ['', 2] }, { values: [Infinity, 2] }])('SPC rejects incomplete/invalid subgroups %j', async input => {
  const result = await record(input);
  expect(result.res.status).toHaveBeenCalledWith(400);
  expect(result.committed).toEqual([]);
});
test('SPC second insert failure rolls back the whole subgroup', async () => {
  const result = await record({ failAt: 2 });
  expect(result.conn.rollback).toHaveBeenCalledTimes(1);
  expect(result.committed).toEqual([]);
  expect(result.res.status).toHaveBeenCalledWith(500);
});
test('SPC retry is a clear conflict, never appends a partial subgroup', async () => {
  const result = await record({ duplicate: true });
  expect(result.res.status).toHaveBeenCalledWith(409);
  expect(result.committed).toEqual([]);
});
test('SPC valid subgroup commits both samples', async () => {
  const result = await record();
  expect(result.committed).toHaveLength(2);
  expect(result.conn.commit).toHaveBeenCalledTimes(1);
  expect(result.res.status).toHaveBeenCalledWith(201);
});
test.each([{ status: 'completed' }, { status: 'processing', concession_status: 'approved' }, { status: 'processing', concession_status: 'pending' }, { status: 'processing', handled_quantity: 1 }])('NCP stale editor cannot overwrite protected state %j', async current => {
  const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn(async sql => {
    expect(sql).toContain('FOR UPDATE'); return [[current]];
  }) };
  db.pool.getConnection.mockResolvedValue(conn);
  await expect(Ncp.updateDisposition(9, { disposition: 'rework' })).rejects.toMatchObject({ httpStatus: 409 });
  expect(conn.commit).not.toHaveBeenCalled();
  expect(conn.rollback).toHaveBeenCalledTimes(1);
  expect(conn.query).toHaveBeenCalledTimes(1);
});
test('NCP checks affectedRows before writing audit action', async () => {
  const conn = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(), query: jest.fn()
    .mockResolvedValueOnce([[{ status: 'pending' }]]).mockResolvedValueOnce([{ affectedRows: 0 }]) };
  db.pool.getConnection.mockResolvedValue(conn);
  await expect(Ncp.updateDisposition(9, { disposition: 'rework' })).rejects.toThrow('更新失败');
  expect(conn.query).toHaveBeenCalledTimes(2);
});
test('unsupported quality settings are neither returned nor accepted as active policy', async () => {
  rules.clearCache();
  db.pool.execute.mockResolvedValue([[{ value: JSON.stringify({ quality: { enableFinalInspection: false }, inventory: { lowStockThreshold: 20 } }) }]]);
  const config = await rules.getBusinessRules();
  expect(config.quality).toBeUndefined();
  expect(config.inventory.lowStockThreshold).toBe(20);
  db.pool.execute.mockClear();
  await expect(rules.updateBusinessRules({ quality: { autoQuarantine: true } })).rejects.toMatchObject({ statusCode: 400 });
  expect(db.pool.execute).not.toHaveBeenCalled();
});
test('batch task shares use all persisted sources, not only the requested task', async () => {
  const items = [{ outbound_id: 5, material_id: 3, source_tasks: JSON.stringify([{ task_id: 7, actual_quantity: 30 }, { task_id: 8, actual_quantity: 70 }]) }];
  const conn = { execute: jest.fn(async () => [items]) };
  const movement = [{ outbound_id: 5, reference_type: 'batch_production_tasks', material_id: 3, location_id: 2, batch_number: 'A', issued_quantity: 100, unit_cost: 4 }];
  const a = await Allocation.allocate(conn, movement, 7);
  const b = await Allocation.allocate(conn, movement, 8);
  expect(a[0].issued_quantity).toBe(30);
  expect(b[0].issued_quantity).toBe(70);
  expect(a[0].unit_cost).toBe(4);
  expect(Allocation.share([{ source_tasks: null }], 7)).toBe(0);
});

test('supplement issue is allocated by outstanding task quantities, not initial issues', async () => {
  const conn = { execute: jest.fn(async () => [[{ outbound_id: 5, material_id: 3, source_tasks: [
    { task_id: 7, actual_quantity: 30, shortage_quantity: 0 },
    { task_id: 8, actual_quantity: 0, shortage_quantity: 70 },
  ] }]]) };
  const movements = [
    { outbound_id: 5, reference_type: 'batch_production_tasks', issue_kind: 'outbound', material_id: 3, location_id: 2, batch_number: 'A', issued_quantity: 30, unit_cost: 4 },
    { outbound_id: 5, reference_type: 'batch_production_tasks', issue_kind: 'outbound_supplement', material_id: 3, location_id: 2, batch_number: 'B', issued_quantity: 70, unit_cost: 5 },
  ];
  expect((await Allocation.allocate(conn, movements, 7)).map(row => [row.batch_number, row.issued_quantity])).toEqual([['A', 30]]);
  expect((await Allocation.allocate(conn, movements, 8)).map(row => [row.batch_number, row.issued_quantity])).toEqual([['B', 70]]);
});

test('warehouse release source selector exposes only unreserved release data', async () => {
  const controller = require('../../src/controllers/business/inventory/inventoryReleaseSourceController');
  const conn = { release: jest.fn(), query: jest.fn(async () => [[
    { id: 1, inspection_no: 'F-1', available_quantity: 0 },
    { id: 2, inspection_no: 'F-2', status: 'passed', batch_no: 'A', qualified_quantity: 10, available_quantity: 4, secret: 'not exposed' },
  ]]) };
  db.pool.getConnection.mockResolvedValue(conn);
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await controller.getTaskReleaseSources({ params: { taskId: 7 } }, res);
  const data = res.json.mock.calls[0][0].data;
  expect(data).toHaveLength(1);
  expect(data[0]).toMatchObject({ id: 2, availableQuantity: 4, batchNo: 'A' });
  expect(data[0].secret).toBeUndefined();
  expect(conn.release).toHaveBeenCalledTimes(1);
});

test('release sources never query quality data for an inaccessible task', async () => {
  const scope = require('../../src/authorization/ScopeGuard');
  scope.denyUnlessAccess.mockResolvedValueOnce(false);
  const conn = { release: jest.fn(), query: jest.fn() };
  db.pool.getConnection.mockResolvedValue(conn);
  await require('../../src/controllers/business/inventory/inventoryReleaseSourceController').getTaskReleaseSources({ params: { taskId: 8 } }, {});
  expect(conn.query).not.toHaveBeenCalled();
  expect(conn.release).toHaveBeenCalled();
});
