jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({ logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/quality/InspectionLockService', () => ({ getForUpdate: jest.fn() }));
const db = require('../../src/config/db');
const QualityInspection = require('../../src/models/qualityInspection');
const locks = require('../../src/services/quality/InspectionLockService');
const inspection = { id: 7, inspection_no: 'QI-7', inspection_type: 'final', reference_id: 41, status: 'passed',
  quantity: 100, qualified_quantity: 100, unqualified_quantity: 0, is_aql: 0, is_full_inspection: 1,
  material_id: 9, product_id: 9, batch_no: 'BATCH-7' };
let connection, inbounds, nonconformances, items;
beforeEach(() => {
  inbounds = [{ id: 8 }]; nonconformances = [];
  items = [{ item_name: '外观', type: 'visual', standard: '无缺陷', result: 'passed', actual_value: '√', measure_1: '√', measure_2: '√' }];
  locks.getForUpdate.mockResolvedValue({ ...inspection });
  connection = { beginTransaction: jest.fn(), commit: jest.fn(), rollback: jest.fn(), release: jest.fn(),
    execute: jest.fn(async () => [{ affectedRows: 1 }]),
    query: jest.fn(async sql => {
      if (sql.includes('FROM nonconforming_products')) return [nonconformances];
      if (sql.includes('FROM inventory_inbound')) return [inbounds];
      if (sql.includes('FROM quality_inspection_items')) return [items];
      throw new Error('Unexpected query: ' + sql);
    }),
  };
  db.pool.getConnection.mockResolvedValue(connection);
});

test.each([
  { status: 'failed', qualified_quantity: 0, unqualified_quantity: 100 },
  { quantity: 90 }, { batch_no: 'ANOTHER' }, { reference_id: 42 }, { product_id: 10 },
  { task_id: 42 }, { unit_id: 2 }, { unit: '箱' },
  { items: [] },
])('rejects changing final evidence linked to active inbound: %j', async data => {
  await expect(QualityInspection.updateInspection(7, data)).rejects.toThrow('生产入库依据');
  expect(connection.execute).not.toHaveBeenCalled();
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.release).toHaveBeenCalledTimes(1);
});

test('rejects changed qualitative samples even when both values are nonnumeric', async () => {
  await expect(QualityInspection.updateInspection(7, { items: [{ ...items[0], measure_2: '×' }] })).rejects.toThrow('生产入库依据');
});

test('allows identical evidence and unrelated note changes', async () => {
  await expect(QualityInspection._assertLinkedEvidenceUnchanged(connection, inspection, {
    note: '补充说明', qualified_quantity: 100, items: [{ ...items[0] }],
  })).resolves.toBeUndefined();
});

test('allows correction after all inbounds were cancelled/reversed and there is no NCP', async () => {
  inbounds = [];
  await expect(QualityInspection._assertLinkedEvidenceUnchanged(connection, inspection, { status: 'failed' })).resolves.toBeUndefined();
  expect(connection.query).toHaveBeenCalledWith(expect.stringContaining("status NOT IN ('cancelled', 'reversed')"), [7, 'QI-7']);
});

test('keeps final evidence immutable after nonconformance disposition even without inbound', async () => {
  inbounds = []; nonconformances = [{ id: 9 }];
  await expect(QualityInspection.updateInspection(7, { status: 'passed', qualified_quantity: 99 })).rejects.toThrow('不合格品处置依据');
});
