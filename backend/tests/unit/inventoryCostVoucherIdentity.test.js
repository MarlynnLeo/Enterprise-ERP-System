/* global afterEach, beforeEach, describe, expect, jest, test */

jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/services/business/TaskLifecycleService', () => ({}));
jest.mock('../../src/models/finance', () => ({ reverseEntry: jest.fn(async (id) => id + 100) }));

const { DatabaseSync } = require('node:sqlite');
const Closure = require('../../src/services/business/InventoryPostingReversalClosureService');
const finance = require('../../src/models/finance');
const SalesReversal = require('../../src/services/business/SalesOutboundReversalService');
const { buildCostDocumentNumber } = require('../../src/utils/inventoryCostDocumentIdentity');

describe('inventory cost voucher ownership', () => {
  let database;
  let connection;

  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.exec(`
      CREATE TABLE inventory_posting_documents (id INTEGER, source_no TEXT, posting_kind TEXT, finance_status TEXT, source_type TEXT);
      CREATE TABLE inventory_posting_lines (id INTEGER, posting_document_id INTEGER, material_id INTEGER, reference_no TEXT);
      CREATE TABLE gl_entries (id INTEGER, document_number TEXT, document_type TEXT, is_posted INTEGER DEFAULT 1, is_reversed INTEGER DEFAULT 0, reversal_entry_id INTEGER);
    `);
    connection = {
      execute: async (sql, params) => [
        database.prepare(sql.replace(/FOR UPDATE/g, '')).all(...params),
      ],
    };
  });

  afterEach(() => database.close());

  function addPosting(id, sourceNo, lineIds, sourceType = 'inbound') {
    database
      .prepare('INSERT INTO inventory_posting_documents VALUES (?, ?, ?, ?, ?)')
      .run(id, sourceNo, 'movement', 'approved', sourceType);
    for (const lineId of lineIds) {
      database
        .prepare('INSERT INTO inventory_posting_lines VALUES (?, ?, ?, ?)')
        .run(lineId, id, 7, sourceNo);
    }
  }

  function addVoucher(id, number, type = 'adjustment') {
    database
      .prepare('INSERT INTO gl_entries (id, document_number, document_type) VALUES (?, ?, ?)')
      .run(id, number, type);
  }

  test('matches exact source and frozen line identities without wildcard or unrelated document types', async () => {
    const sourceNo = 'IN-%_01';
    addPosting(1, sourceNo, [11]);
    addPosting(2, `${sourceNo}-child`, [12]);
    addPosting(3, sourceNo, [13]);
    addVoucher(1, `${sourceNo}-M7-L11`);
    addVoucher(2, sourceNo, 'inventory_inbound');
    addVoucher(3, sourceNo, 'invoice');
    addVoucher(4, `${sourceNo}-child-M7-L12`);
    addVoucher(5, 'IN-XX01-OTHER');
    addVoucher(6, `${sourceNo}-M7-L13`);

    const result = await Closure.reverseRelatedVouchers(connection, {
      sourceType: 'inbound',
      sourceNo,
      originalPostingDocumentId: 1,
      operator: 60,
    });

    expect(result.reversedCount).toBe(2);
    expect(finance.reverseEntry.mock.calls.map(([id]) => id)).toEqual([1, 2]);
  });

  test('finds both bounded long-source identities and blocks ambiguous truncated historical vouchers', async () => {
    const sourceNo = 'IN-'.padEnd(50, 'X');
    addPosting(1, sourceNo, [11, 12]);
    for (const lineId of [11, 12]) {
      addVoucher(
        lineId,
        buildCostDocumentNumber({ reference_no: sourceNo, material_id: 7, posting_line_id: lineId })
      );
    }
    const options = { sourceType: 'inbound', sourceNo, originalPostingDocumentId: 1 };
    await expect(Closure.findRelatedCostEntries(connection, options)).resolves.toEqual([
      { id: 11 },
      { id: 12 },
    ]);

    addVoucher(99, sourceNo);
    await expect(Closure.reverseRelatedVouchers(connection, options)).rejects.toThrow('编号被截断');
    expect(finance.reverseEntry).not.toHaveBeenCalled();
  });

  test('same-number postings from another business type cannot contribute cost voucher candidates', async () => {
    addPosting(1, 'OUT-1', [11], 'outbound');
    addPosting(2, 'OUT-1', [12], 'inbound');
    addVoucher(11, 'OUT-1-M7-L11');
    addVoucher(12, 'OUT-1-M7-L12');

    await expect(
      Closure.findRelatedCostEntries(connection, { sourceType: 'outbound', sourceNo: 'OUT-1' })
    ).resolves.toEqual([{ id: 11 }]);
  });

  test('sales legacy fallback accepts only missing document types and cannot reverse same-number invoices', async () => {
    addVoucher(21, 'SO-1', 'invoice');
    addVoucher(22, 'SO-1', null);

    await expect(SalesReversal.reverseCostEntries(connection, 'SO-1', 60)).resolves.toBe(1);
    expect(finance.reverseEntry.mock.calls.map(([id]) => id)).toEqual([22]);
  });
});
