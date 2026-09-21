/* global beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
jest.mock('../../src/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock('../../src/services/business/InspectionTemplateResolverService', () => ({
  getInspectionMaterialId: jest.fn(() => 3),
  findMatchingTemplate: jest.fn(async () => null),
  createValidationError: (message) => Object.assign(new Error(message), { statusCode: 400 }),
}));
jest.mock('../../src/services/quality/InspectionClosureService', () => ({
  isTerminalStatus: (status) => ['passed', 'partial', 'failed', 'completed'].includes(status),
  closeIfTerminal: jest.fn(async () => ({})),
}));

const QualityInspection = require('../../src/models/qualityInspection');
const InspectionLockService = require('../../src/services/quality/InspectionLockService');
const db = require('../../src/config/db');

const item = (values = {}) => ({
  item_name: '尺寸',
  standard: '10±1',
  type: 'dimension',
  result: 'failed',
  actual_value: '12',
  dimension_value: 10,
  tolerance_upper: 1,
  tolerance_lower: 1,
  is_critical: 0,
  measure_1: 12,
  ...values,
});
const inspection = (values = {}) => ({
  id: 7,
  inspection_no: 'QI-7',
  inspection_type: 'incoming',
  source_type: 'purchase_order',
  reference_id: 2,
  reference_no: 'PO-2',
  material_id: 3,
  purchase_order_item_id: 4,
  supplier_id: 6,
  unit_id: 1,
  unit: '个',
  inspector_id: 8,
  inspector_name: 'Inspector',
  batch_no: 'BATCH-7',
  quantity: 10,
  qualified_quantity: 6,
  unqualified_quantity: 4,
  status: 'partial',
  planned_date: '2026-09-20',
  items: [item()],
  ...values,
});

function connectionFor({ current = inspection(), ncp = false, receipt = null, ordered = 10 } = {}) {
  let persisted = { ...current };
  const calls = [];
  const connection = {
    calls,
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    query: jest.fn(async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('FROM purchase_orders'))
        return [[{ id: 2, order_no: 'PO-2', supplier_id: 6, status: 'approved' }]];
      if (sql.includes('FROM purchase_order_items'))
        return [[{ id: 4, material_id: 3, quantity: ordered }]];
      if (sql.includes('FROM quality_inspections')) return persisted ? [[{ ...persisted }]] : [[]];
      if (sql.includes('FROM quality_inspection_items')) return [current.items];
      if (sql.includes('FROM nonconforming_products')) return [ncp ? [{ id: 90 }] : []];
      if (sql.includes('FROM purchase_receipts')) return [receipt ? [receipt] : []];
      if (
        sql.includes('FROM purchase_receipt_items ri') ||
        sql.includes('FROM purchase_return_items rti')
      )
        return [[]];
      if (sql.includes('FROM materials m LEFT JOIN inspection_methods'))
        return [[{ code: 'full' }]];
      if (sql.includes('INSERT INTO quality_inspections')) {
        const columns = sql
          .match(/INSERT INTO quality_inspections\s*\(([^)]+)\)/)[1]
          .split(',')
          .map((column) => column.trim());
        persisted = {
          id: 7,
          ...Object.fromEntries(columns.map((column, index) => [column, values[index]])),
        };
        return [{ insertId: 7 }];
      }
      if (sql.includes('INSERT INTO quality_inspection_items')) return [{ insertId: 70 }];
      throw new Error(`Unexpected query: ${sql}`);
    }),
    execute: jest.fn(async (sql, values) => {
      calls.push({ sql, values });
      if (sql.includes('UPDATE quality_inspections') && sql.includes('quantity = ?'))
        persisted.quantity = values[0];
      if (sql.includes('UPDATE `quality_inspections` SET deleted_at')) persisted = null;
      if (sql.includes('SUM(quantity)'))
        return [
          [
            {
              total_quantity: ordered,
              total_received: persisted?.quantity || 0,
              total_inspected: 0,
              total_qualified: 0,
              total_unqualified: 0,
              total_warehoused: 0,
              item_count: 1,
              received_items: 0,
              completed_items: 0,
            },
          ],
        ];
      if (sql.includes('SELECT status FROM purchase_orders')) return [[{ status: 'received' }]];
      return [{ affectedRows: 1 }];
    }),
  };
  return connection;
}

describe('incoming inspection transaction invariants', () => {
  beforeEach(() => jest.clearAllMocks());

  test('the shared lock takes the order before any inspection row lock', async () => {
    const connection = connectionFor();
    await InspectionLockService.getForUpdate(connection, 7);
    const locks = connection.calls.filter(({ sql }) => sql.includes('FOR UPDATE'));
    expect(locks[0].sql).toContain('FROM purchase_orders');
    expect(locks[1].sql).toContain('FROM quality_inspections');
  });

  test('a source changed between discovery and locking is rejected', async () => {
    const connection = connectionFor();
    let reads = 0;
    const query = connection.query.getMockImplementation();
    connection.query.mockImplementation((sql, values) => {
      if (sql.includes('FROM quality_inspections') && ++reads === 2)
        return [[inspection({ reference_id: 99 })]];
      return query(sql, values);
    });
    await expect(InspectionLockService.getForUpdate(connection, 7)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  test.each(['draft', 'inspected', 'completed'])(
    'cannot delete a pending inspection bound to a %s receipt',
    async (status) => {
      const connection = connectionFor({
        current: inspection({ status: 'pending' }),
        receipt: { id: 9, receipt_no: 'PR-9', status },
      });
      db.pool.getConnection.mockResolvedValue(connection);
      await expect(QualityInspection.deleteInspection(7)).rejects.toThrow('先取消关联收货单');
      expect(connection.rollback).toHaveBeenCalledTimes(1);
      expect(connection.execute).not.toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
    }
  );

  test('deleting an unbound arrival releases its quantity and updates the order in the same transaction', async () => {
    const connection = connectionFor({ current: inspection({ status: 'pending' }) });
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(QualityInspection.deleteInspection(7)).resolves.toBe(true);
    const quantityUpdate = connection.calls.find(({ sql }) =>
      sql.includes('UPDATE purchase_order_items')
    );
    expect(quantityUpdate.values).toEqual([0, 4]);
    expect(
      connection.calls.some(
        ({ sql, values }) => sql.includes('UPDATE purchase_orders') && values[0] === 'approved'
      )
    ).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  test.each([
    { qualified_quantity: 8, unqualified_quantity: 2 },
    { quantity: 12, qualified_quantity: 8, unqualified_quantity: 4 },
    { status: 'completed' },
    { supplier_id: 99 },
  ])('existing nonconformance fixes its quantity and judgement evidence: %j', async (data) => {
    const connection = connectionFor({ ncp: true });
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(QualityInspection.updateInspection(7, data)).rejects.toThrow('不合格品处置依据');
    expect(connection.execute).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  test('nonconformance measurements cannot be rewritten while administrative notes remain editable', async () => {
    const connection = connectionFor({ ncp: true });
    await expect(
      QualityInspection.updateInspection(7, { items: [item({ measure_1: 10 })] }, connection)
    ).rejects.toThrow('测量事实');
    await expect(
      QualityInspection.updateInspection(7, { note: '已通知供应商' }, connection)
    ).resolves.toMatchObject({ note: '已通知供应商' });
    await expect(
      QualityInspection.updateInspection(7, { items: [item({ measure_1: '12.00' })] }, connection)
    ).resolves.toMatchObject({ id: 7 });
  });

  test.each([-1, 0, 1.001, 'NaN'])(
    'invalid pending quantity %s cannot reserve or release order capacity',
    async (quantity) => {
      const connection = connectionFor({ current: inspection({ status: 'pending' }) });
      await expect(
        QualityInspection.updateInspection(7, { quantity }, connection)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(connection.execute).not.toHaveBeenCalled();
    }
  );

  test('a pending inspection cannot be enlarged beyond the order', async () => {
    const connection = connectionFor({ current: inspection({ status: 'pending' }) });
    db.pool.getConnection.mockResolvedValue(connection);
    await expect(QualityInspection.updateInspection(7, { quantity: 11 })).rejects.toThrow(
      '超过采购订单数量'
    );
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });

  test.each([-1, 0, 1.001])(
    'creating a pending inspection rejects invalid quantity %s before insertion',
    async (quantity) => {
      const connection = connectionFor();
      await expect(
        QualityInspection.createInspection(inspection({ status: 'pending', quantity }), connection)
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(connection.calls.some(({ sql }) => sql.includes('INSERT'))).toBe(false);
    }
  );
});
