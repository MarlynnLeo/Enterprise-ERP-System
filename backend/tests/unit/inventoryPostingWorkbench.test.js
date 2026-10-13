/* global beforeEach, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {}, getConnection: jest.fn() }));
jest.mock('../../src/services/InventoryService', () => ({ updateStock: jest.fn() }));
jest.mock('../../src/services/business/FinalInspectionReleaseService', () => ({
  validatePosting: jest.fn(),
}));
jest.mock('../../src/services/business/OutboundPostingGroupService', () => ({
  lockSource: jest.fn(),
  assertWritable: jest.fn(),
  prepareReversal: jest.fn(),
}));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(),
  dispatchSoon: jest.fn(),
}));
jest.mock('../../src/utils/logger', () => ({ logger: { warn: jest.fn(), error: jest.fn() } }));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({}));
jest.mock('../../src/models/finance', () => ({ reverseEntry: jest.fn() }));

const db = require('../../src/config/db');
const Posting = require('../../src/services/InventoryPostingService');
const Inventory = require('../../src/services/InventoryService');
const Events = require('../../src/services/business/DomainEventService');
const Closure = require('../../src/services/business/InventoryPostingReversalClosureService');
const finance = require('../../src/models/finance');
const { hashSnapshot } = require('../../src/utils/inventoryPostingSnapshot');

const actor = { id: 9, label: '审核人' };
const document = {
  id: 12,
  source_type: 'inbound',
  source_no: 'IN-12',
  posting_kind: 'movement',
  finance_status: 'pending',
  business_approved_by_id: 8,
};
const payload = {
  materialId: 1,
  locationId: 2,
  transactionType: 'inbound',
  referenceType: 'inbound',
  referenceNo: 'IN-12',
  signedQuantity: 3,
  unitId: 1,
  batchNumber: 'B-1',
  unitCost: 2,
  totalValue: 6,
  transactionDate: '2026-10-12',
  operator: '仓库',
  sourceLineKey: 'L-1',
};
function line(overrides = {}) {
  return {
    id: 21,
    posting_document_id: 12,
    material_id: 1,
    location_id: 2,
    transaction_type: 'inbound',
    reference_type: 'inbound',
    reference_no: 'IN-12',
    signed_quantity: 3,
    unit_id: 1,
    batch_number: 'B-1',
    unit_cost: 2,
    total_value: 6,
    transaction_date: '2026-10-12',
    operator: '仓库',
    source_line_key: 'L-1',
    payload_json: JSON.stringify(payload),
    snapshot_hash: hashSnapshot(payload),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  Inventory.updateStock.mockResolvedValue({ totalValue: 6 });
  Events.enqueue.mockResolvedValue(100);
});

test('batch approval deduplicates IDs and preserves partial failures with accurate counts', async () => {
  const approve = jest
    .spyOn(Posting, 'approve')
    .mockResolvedValueOnce({ documentId: 12 })
    .mockRejectedValueOnce(
      Object.assign(new Error('需要不同审核人'), { code: 'SEPARATION_OF_DUTIES' })
    );
  const result = await Posting.batchApprove([12, '12', 13], actor);
  expect(result).toMatchObject({ totalCount: 2, successCount: 1, failureCount: 1 });
  expect(result.results).toEqual([
    { id: 12, success: true, result: { documentId: 12 } },
    { id: 13, success: false, error: '需要不同审核人', code: 'SEPARATION_OF_DUTIES' },
  ]);
  expect(approve).toHaveBeenCalledTimes(2);
});

test.each([[12, '13xyz'], [12, 0], [12, null], [12, {}], Array(101).fill(12)])(
  'invalid batch input causes no partial mutations: %j',
  async (...ids) => {
    const approve = jest.spyOn(Posting, 'approve');
    await expect(Posting.batchApprove(ids, actor)).rejects.toMatchObject({ statusCode: 400 });
    expect(approve).not.toHaveBeenCalled();
  }
);

test.each(['', '   ', {}, 'x'.repeat(1001)])(
  'reject requires a valid reason before opening a transaction',
  async (remark) => {
    await expect(Posting.reject(12, actor, remark)).rejects.toMatchObject({
      code: 'INVALID_REMARK',
    });
    expect(db.getConnection).not.toHaveBeenCalled();
  }
);

test.each([
  { signed_quantity: 30 },
  { unit_cost: 20 },
  { batch_number: 'OTHER' },
  { material_id: 77 },
  { location_id: 77 },
  { payload_json: '{' },
  { snapshot_hash: 'invalid' },
])('approval refuses a changed frozen line before writing stock: %j', async (overrides) => {
  await expect(
    Posting._postLines({ execute: jest.fn() }, document, [line(overrides)], actor)
  ).rejects.toMatchObject({ code: 'SNAPSHOT_INVALID' });
  expect(Inventory.updateStock).not.toHaveBeenCalled();
});

test('MySQL JSON key reordering does not break the immutable snapshot check', async () => {
  const reordered = Object.fromEntries(Object.entries(payload).reverse());
  const connection = { execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }]) };
  await Posting._postLines(connection, document, [line({ payload_json: reordered })], actor);
  expect(Inventory.updateStock).toHaveBeenCalledWith(
    expect.objectContaining({
      quantity: 3,
      unitCost: 2,
      postingDocumentId: 12,
      postingLineId: 21,
    }),
    connection
  );
});

test('a posted marker without a matching ledger cannot silently approve an empty movement', async () => {
  const connection = { execute: jest.fn().mockResolvedValue([[]]) };
  await expect(
    Posting._postLines(connection, document, [line({ posted_quantity: 3, posted_value: 6 })], actor)
  ).rejects.toMatchObject({ code: 'LEDGER_MISMATCH' });
  expect(Inventory.updateStock).not.toHaveBeenCalled();
});

test('replaying a fully posted line leaves stock unchanged after verifying its ledger', async () => {
  const connection = {
    execute: jest.fn().mockResolvedValue([
      [
        {
          material_id: 1,
          location_id: 2,
          quantity: 3,
          total_value: 6,
          batch_number: 'B-1',
        },
      ],
    ]),
  };
  const result = await Posting._postLines(
    connection,
    document,
    [line({ posted_quantity: 3, posted_value: 6 })],
    actor
  );
  expect(result[0].alreadyPosted).toBe(true);
  expect(Inventory.updateStock).not.toHaveBeenCalled();
});

function approvalConnection() {
  return {
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn(),
    execute: jest.fn(async (sql) =>
      sql.includes('FROM inventory_posting_lines WHERE posting_document_id')
        ? [[line()]]
        : [{ affectedRows: 1 }]
    ),
  };
}

test('approval rolls back if the finance task could not be persisted', async () => {
  const connection = approvalConnection();
  db.getConnection.mockResolvedValue(connection);
  jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue(document);
  Events.enqueue.mockResolvedValue(false);
  await expect(Posting.approve(12, actor)).rejects.toMatchObject({
    code: 'FINANCE_EVENT_REQUIRED',
  });
  expect(connection.rollback).toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
  expect(Events.dispatchSoon).not.toHaveBeenCalled();
});

test('an external transaction queues finance work without dispatching before its owner commits', async () => {
  const connection = approvalConnection();
  jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue(document);
  await Posting.approve(12, actor, connection);
  expect(Events.enqueue).toHaveBeenCalled();
  expect(Events.dispatchSoon).not.toHaveBeenCalled();
  expect(connection.commit).not.toHaveBeenCalled();
});

test('financial integration locks and rechecks an approved snapshot before generating a voucher', async () => {
  const stale = { ...document, finance_status: 'approved', locked: 1 };
  jest.spyOn(Posting, 'findApprovedForTransaction').mockResolvedValue(stale);
  const lock = jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue({
    ...stale,
    finance_status: 'reversed',
  });
  const connection = { execute: jest.fn().mockResolvedValue([[]]) };
  await expect(
    Posting.requireApprovedForTransaction(connection, { posting_document_id: 12 })
  ).rejects.toMatchObject({ code: 'INVENTORY_POSTING_REQUIRED' });
  expect(lock).toHaveBeenCalledWith(connection, 12);
});

test('financial integration holds the same document lock as reversal until its transaction completes', async () => {
  const approved = { ...document, finance_status: 'approved', locked: 1 };
  jest.spyOn(Posting, 'findApprovedForTransaction').mockResolvedValue(approved);
  const lock = jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue(approved);
  const connection = { execute: jest.fn() };
  await expect(
    Posting.requireApprovedForTransaction(connection, { posting_document_id: 12 })
  ).resolves.toBe(approved);
  expect(lock).toHaveBeenCalledWith(connection, 12);
});

test('unsupported reversal sources are rejected before creating a request', async () => {
  const connection = { execute: jest.fn() };
  jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue({
    ...document,
    source_type: 'manual_transaction',
    finance_status: 'approved',
    locked: 1,
  });
  await expect(Posting.requestReversal(12, actor, '修正', {}, connection)).rejects.toMatchObject({
    code: 'REVERSAL_NOT_SUPPORTED',
  });
  expect(connection.execute).not.toHaveBeenCalled();
});

test('re-staging an identical business line does not change document totals or snapshot hash', async () => {
  jest.spyOn(Posting, '_getOrCreateDocument').mockResolvedValue(document);
  let storedLine;
  const connection = {
    execute: jest.fn(async (sql, values) => {
      if (sql.includes('MAX(line_no)')) return [[{ max_line_no: storedLine ? 1 : 0 }]];
      if (sql.includes('SELECT id, snapshot_hash')) return [storedLine ? [storedLine] : []];
      if (sql.includes('INSERT INTO inventory_posting_lines')) {
        storedLine = { id: 21, snapshot_hash: values[16] };
        return [{ insertId: 21 }];
      }
      return [{ affectedRows: 1 }];
    }),
  };
  await Posting.stageMovement(connection, { sourceType: 'inbound', sourceNo: 'IN-12' }, [payload]);
  await Posting.stageMovement(connection, { sourceType: 'inbound', sourceNo: 'IN-12' }, [payload]);
  expect(
    connection.execute.mock.calls.filter(([sql]) =>
      sql.includes('UPDATE inventory_posting_documents')
    )
  ).toHaveLength(1);
  expect(
    connection.execute.mock.calls.filter(([sql]) =>
      sql.includes('INSERT INTO inventory_posting_lines')
    )
  ).toHaveLength(1);
});

test('a missing ledger on any original line blocks a partial reversal request', async () => {
  jest
    .spyOn(Posting, '_lockDocumentForAction')
    .mockResolvedValue({ ...document, finance_status: 'approved', locked: 1 });
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([[line({ ledger_id: null })]]),
  };
  await expect(Posting.requestReversal(12, actor, '修正', {}, connection)).rejects.toMatchObject({
    code: 'LEDGER_NOT_FOUND',
  });
  expect(connection.execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(
    true
  );
});

test('reversal snapshots preserve the quantity and cost of actual ledger entries', async () => {
  jest
    .spyOn(Posting, '_lockDocumentForAction')
    .mockResolvedValue({ ...document, finance_status: 'approved', locked: 1 });
  jest
    .spyOn(Posting, '_getOrCreateDocument')
    .mockResolvedValue({ id: 22, source_type: 'inbound', source_no: 'IN-12-REV-12' });
  const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({ documentId: 22 });
  const connection = {
    execute: jest
      .fn()
      .mockResolvedValueOnce([[]])
      .mockResolvedValueOnce([
        [line({ ledger_id: 31, ledger_quantity: 3, ledger_unit_cost: 7, ledger_value: 21 })],
      ])
      .mockResolvedValueOnce([{ insertId: 32 }]),
  };
  await Posting.requestReversal(12, actor, '修正', {}, connection);
  expect(stage).toHaveBeenCalledWith(connection, expect.any(Object), [
    expect.objectContaining({
      signedQuantity: -3,
      unitCost: 7,
      totalValue: -21,
      reversalOfLedgerId: 31,
      sourceLineKey: 'reversal-of-ledger:31',
    }),
  ]);
});

test.each([false, true])(
  'reversal SQL reads every frozen line and its actual ledger (missing ledger: %s)',
  async (missingLedger) => {
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(`
      CREATE TABLE inventory_posting_documents (id INTEGER, posting_no TEXT, finance_status TEXT,
        original_posting_document_id INTEGER, posting_kind TEXT);
      CREATE TABLE inventory_posting_lines (id INTEGER, posting_document_id INTEGER, line_no INTEGER,
        source_line_key TEXT, material_id INTEGER, location_id INTEGER, transaction_type TEXT,
        reference_type TEXT, reference_no TEXT, signed_quantity NUMERIC, unit_id INTEGER, batch_number TEXT,
        unit_cost NUMERIC, total_value NUMERIC, transaction_date TEXT, operator TEXT, payload_json TEXT,
        snapshot_hash TEXT, posted_quantity NUMERIC, posted_value NUMERIC, created_at TEXT, updated_at TEXT);
      CREATE TABLE inventory_ledger (id INTEGER, posting_line_id INTEGER, quantity NUMERIC,
        unit_cost NUMERIC, total_value NUMERIC);
      CREATE TABLE inventory_posting_events (posting_document_id INTEGER, event_type TEXT, from_status TEXT,
        to_status TEXT, actor_id INTEGER, actor_label TEXT, remark TEXT, event_data TEXT);
      INSERT INTO inventory_posting_lines (id, posting_document_id, line_no, material_id, location_id,
        transaction_type, reference_type, reference_no, signed_quantity, unit_cost, total_value)
        VALUES (21, 12, 1, 1, 2, 'inbound', 'inbound', 'IN-12', 3, 2, 6),
               (22, 12, 2, 1, 2, 'inbound', 'inbound', 'IN-12', 4, 2, 8);
      INSERT INTO inventory_ledger VALUES (31, 21, 3, 7, 21);
    `);
      if (!missingLedger) database.exec('INSERT INTO inventory_ledger VALUES (32, 22, 4, 7, 28)');
      const connection = {
        execute: async (sql, params) => {
          const statement = database.prepare(sql.replace(/FOR UPDATE/g, ''));
          return /^\s*SELECT/.test(sql) ? [statement.all(...params)] : [statement.run(...params)];
        },
      };
      jest.spyOn(Posting, '_lockDocumentForAction').mockResolvedValue({
        ...document,
        finance_status: 'approved',
        locked: 1,
      });
      const create = jest.spyOn(Posting, '_getOrCreateDocument').mockResolvedValue({
        id: 30,
        source_type: 'inbound',
        source_no: 'IN-12-REV-12',
      });
      const stage = jest.spyOn(Posting, 'stageMovement').mockResolvedValue({ documentId: 30 });
      const request = Posting.requestReversal(12, actor, '修正', {}, connection);
      if (missingLedger) {
        await expect(request).rejects.toMatchObject({ code: 'LEDGER_NOT_FOUND' });
        expect(create).not.toHaveBeenCalled();
        expect(stage).not.toHaveBeenCalled();
      } else {
        await request;
        expect(stage.mock.calls[0][2]).toEqual([
          expect.objectContaining({
            signedQuantity: -3,
            unitCost: 7,
            totalValue: -21,
            reversalOfLedgerId: 31,
          }),
          expect.objectContaining({
            signedQuantity: -4,
            unitCost: 7,
            totalValue: -28,
            reversalOfLedgerId: 32,
          }),
        ]);
      }
    } finally {
      database.close();
    }
  }
);

test('internal transfer closure accepts its normal no-voucher path', async () => {
  const connection = {
    execute: jest.fn(async (sql) => {
      if (sql.includes('FROM inventory_transfers'))
        return [[{ id: 12, transfer_no: 'TR-12', status: 'completed' }]];
      if (sql.includes('FROM inventory_posting_documents')) return [[]];
      if (sql.includes('FROM gl_entries')) return [[]];
      return [{ affectedRows: 1 }];
    }),
  };
  const result = await Closure.closeTransfer(
    connection,
    { sourceType: 'transfer', sourceId: 12, sourceNo: 'TR-12' },
    actor
  );
  expect(result).toMatchObject({ businessClosed: true, financeReversal: { reversedCount: 0 } });
  expect(finance.reverseEntry).not.toHaveBeenCalled();
  await expect(
    Closure.reverseRelatedVouchers(connection, { sourceType: 'inbound', sourceNo: 'IN-12' })
  ).rejects.toThrow('没有可冲销');
});

test('historical transfer vouchers are reversed under the actual reviewer identity', async () => {
  const connection = {
    execute: jest.fn(async (sql) => {
      if (sql.includes('FROM inventory_transfers'))
        return [[{ id: 12, transfer_no: 'TR-12', status: 'completed' }]];
      if (sql.includes('FROM inventory_posting_documents')) return [[]];
      if (sql.includes('FROM gl_entries')) return [[{ id: 50 }]];
      return [{ affectedRows: 1 }];
    }),
  };
  await Closure.closeTransfer(
    connection,
    { sourceType: 'transfer', sourceId: 12, sourceNo: 'TR-12' },
    actor
  );
  expect(finance.reverseEntry).toHaveBeenCalledWith(
    50,
    expect.objectContaining({ created_by: 9 }),
    connection
  );
});
