/* global test, expect, jest */
jest.mock('../../src/services/business/TaskLifecycleService', () => ({
  promoteTaskStatus: jest.fn(),
  syncPlanStatus: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const { DatabaseSync } = require('node:sqlite');
const Guard = require('../../src/services/business/ProductionReturnReversalGuard');
const ProductionReturnService = require('../../src/services/business/ProductionReturnService');
const Closure = require('../../src/services/business/InventoryPostingReversalClosureService');

function fixture() {
  const db = new DatabaseSync(':memory:');
  db.function('JSON_CONTAINS', (source, value) =>
    Number(JSON.parse(source).includes(typeof value === 'number' ? value : JSON.parse(value)))
  );
  db.exec(`
    CREATE TABLE production_tasks (id, plan_id);
    CREATE TABLE inventory_outbound (id, outbound_no, reference_type, reference_id, production_task_id, source_task_ids);
    CREATE TABLE inventory_inbound (id, inbound_no, inbound_type, reference_type, reference_id, reference_no, status, is_deleted, deleted_at);
    CREATE TABLE inventory_posting_documents (id, source_type, source_id, source_no, posting_kind, finance_status, original_posting_document_id);
    INSERT INTO production_tasks VALUES (7, 10), (8, 11);
    INSERT INTO inventory_outbound VALUES (1, 'OUT-1', 'production_task', 7, 7, NULL), (2, 'OUT-2', 'production_task', 8, 8, NULL), (3, 'OUT-3', 'production_plan', 10, NULL, NULL), (4, 'OUT-4', 'batch_production_tasks', NULL, NULL, '[7,8]');
  `);
  const connection = {
    execute: jest.fn(async (sql, params) => {
      const adapted = sql
        .replaceAll('COLLATE utf8mb4_unicode_ci', 'COLLATE NOCASE')
        .replaceAll('CAST(guard_task.id AS JSON)', 'guard_task.id')
        .replaceAll(
          "CONCAT(return_source.outbound_no, '-补发')",
          "(return_source.outbound_no || '-补发')"
        )
        .replaceAll(' FOR UPDATE', '');
      return [db.prepare(adapted).all(...params)];
    }),
  };
  return { db, connection };
}

test.each([
  ['production_task', 7, null, 'confirmed'],
  ['production_task', 7, null, 'completed'],
  ['outbound', 1, null, 'completed'],
  ['outbound', null, 'OUT-1', 'confirmed'],
  ['outbound', 3, null, 'confirmed'],
  ['outbound', 4, null, 'confirmed'],
])('existing %s return prevents reversing its production task', async (type, id, no, status) => {
  const { db, connection } = fixture();
  try {
    db.prepare(
      "INSERT INTO inventory_inbound VALUES (10, 'IN-10', 'production_return', ?, ?, ?, ?, 0, NULL)"
    ).run(type, id, no, status);
    await expect(Guard.assertReversalAllowed(connection, [7])).rejects.toMatchObject({
      httpStatus: 409,
      errorCode: 'PRODUCTION_RETURN_BLOCKS_REVERSAL',
      message: expect.stringContaining('先取消或反审核'),
    });
    expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  } finally {
    db.close();
  }
});

test.each(['draft', 'cancelled', 'reversed'])(
  'a %s return does not prevent outbound reversal',
  async (status) => {
    const { db, connection } = fixture();
    try {
      db.prepare(
        "INSERT INTO inventory_inbound VALUES (10, 'IN-10', 'production_return', 'production_task', 7, NULL, ?, 0, NULL)"
      ).run(status);
      await expect(Guard.assertReversalAllowed(connection, [7])).resolves.toBeUndefined();
    } finally {
      db.close();
    }
  }
);

test.each([1, 3, 4])(
  'pending reversal of source %s prevents returns for its task',
  async (sourceId) => {
    const { db, connection } = fixture();
    try {
      db.prepare(
        "INSERT INTO inventory_posting_documents VALUES (20, 'outbound', ?, 'REV-20', 'reversal', 'pending', 19)"
      ).run(sourceId);
      await expect(Guard.assertReturnAllowed(connection, [7])).rejects.toMatchObject({
        httpStatus: 409,
        errorCode: 'OUTBOUND_REVERSAL_BLOCKS_RETURN',
      });
      expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
    } finally {
      db.close();
    }
  }
);

test('legacy supplement reversal resolves the task through its original movement', async () => {
  const { db, connection } = fixture();
  try {
    db.exec(
      "INSERT INTO inventory_posting_documents VALUES (19, 'outbound_supplement', NULL, 'OUT-1-补发', 'movement', 'approved', NULL), (20, 'outbound_supplement', NULL, 'REV-20', 'reversal', 'pending', 19)"
    );
    await expect(Guard.assertReturnAllowed(connection, [7])).rejects.toMatchObject({
      errorCode: 'OUTBOUND_REVERSAL_BLOCKS_RETURN',
    });
    await expect(Guard.assertReturnAllowed(connection, [8])).resolves.toBeUndefined();
  } finally {
    db.close();
  }
});

test('rejected reversal and another task pending reversal do not block returns', async () => {
  const { db, connection } = fixture();
  try {
    db.exec(
      "INSERT INTO inventory_posting_documents VALUES (20, 'outbound', 1, 'REV-20', 'reversal', 'rejected', 19), (21, 'outbound', 2, 'REV-21', 'reversal', 'pending', 18)"
    );
    await expect(Guard.assertReturnAllowed(connection, [7])).resolves.toBeUndefined();
  } finally {
    db.close();
  }
});

test('return validation locks the task then checks pending reversal before accepting any quantity', async () => {
  const connection = {
    execute: jest.fn(async (sql) => {
      if (/FROM production_tasks t/.test(sql)) return [[{ id: 7 }]];
      if (/FROM inventory_posting_documents reversal/.test(sql)) return [[{ id: 20 }]];
      throw new Error(`No capacity query expected: ${sql}`);
    }),
  };
  await expect(
    ProductionReturnService.validate(
      connection,
      { inbound_type: 'production_return', reference_type: 'production_task', reference_id: 7 },
      [{ material_id: 3, quantity: 5, location_id: 2, batch_number: 'B1' }]
    )
  ).rejects.toMatchObject({ errorCode: 'OUTBOUND_REVERSAL_BLOCKS_RETURN' });
  expect(connection.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(connection.execute.mock.calls[1][0]).toContain('FOR UPDATE');
  expect(connection.execute).toHaveBeenCalledTimes(2);
});

test.each(['production_task', 'production_plan'])(
  'reversal closure validates %s returns after locking affected tasks',
  async (referenceType) => {
    const connection = {
      execute: jest.fn(async (sql) => {
        if (/FROM production_tasks/.test(sql))
          return [[{ id: 7, status: 'material_issued', code: 'PT-7' }]];
        if (/FROM production_plans/.test(sql))
          return [[{ id: 10, status: 'material_issued', code: 'PP-10' }]];
        if (/FROM inventory_inbound i/.test(sql)) return [[{ id: 30, inbound_no: 'IN-30' }]];
        throw new Error(`Unexpected SQL ${sql}`);
      }),
    };
    await expect(
      Closure.assertOutboundReversalAllowed(connection, {
        id: 1,
        status: 'completed',
        reference_type: referenceType,
        reference_id: referenceType === 'production_task' ? 7 : 10,
      })
    ).rejects.toMatchObject({ errorCode: 'PRODUCTION_RETURN_BLOCKS_REVERSAL' });
    const taskLock = connection.execute.mock.calls.findIndex(([sql]) =>
      /FROM production_tasks/.test(sql)
    );
    const returnCheck = connection.execute.mock.calls.findIndex(([sql]) =>
      /FROM inventory_inbound i/.test(sql)
    );
    expect(taskLock).toBeLessThan(returnCheck);
    expect(connection.execute.mock.calls[taskLock][0]).toContain('FOR UPDATE');
    expect(connection.execute.mock.calls[returnCheck][1]).toEqual([7, 7]);
  }
);
