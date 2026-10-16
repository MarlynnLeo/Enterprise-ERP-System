/* global afterEach, beforeEach, describe, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: {} }));

const { DatabaseSync } = require('node:sqlite');
const Posting = require('../../src/services/InventoryPostingService');

describe('inventory posting source association against SQL', () => {
  let database;
  let connection;
  beforeEach(() => {
    database = new DatabaseSync(':memory:');
    database.function('CONCAT', (...values) => values.join(''));
    database.exec(`
      CREATE TABLE inventory_posting_documents (
        id INTEGER PRIMARY KEY, posting_no TEXT, source_type TEXT, source_id INTEGER, source_no TEXT,
        posting_sequence INTEGER DEFAULT 1, posting_kind TEXT DEFAULT 'movement',
        original_posting_document_id INTEGER, movement_direction TEXT, transaction_date TEXT,
        finance_status TEXT DEFAULT 'approved', business_approved_by_id INTEGER,
        business_approved_by TEXT, business_approved_at TEXT, finance_approved_by INTEGER,
        finance_approved_label TEXT, finance_approved_at TEXT, rejected_by INTEGER,
        rejected_label TEXT, rejected_at TEXT, reversed_by INTEGER, reversed_label TEXT,
        reversed_at TEXT, snapshot_hash TEXT, snapshot_version INTEGER, locked INTEGER DEFAULT 1,
        is_legacy INTEGER DEFAULT 0, total_quantity NUMERIC, total_value NUMERIC, remark TEXT,
        created_at TEXT, updated_at TEXT
      );
      CREATE TABLE inventory_posting_lines (id INTEGER PRIMARY KEY, posting_document_id INTEGER,
        reference_no TEXT, reference_type TEXT, transaction_type TEXT, payload_json TEXT);
      CREATE TABLE inventory_posting_events (id INTEGER, posting_document_id INTEGER,
        event_type TEXT, from_status TEXT, to_status TEXT, actor_id INTEGER, actor_label TEXT,
        remark TEXT, event_data TEXT, created_at TEXT);
      CREATE TABLE inventory_outbound (id INTEGER, outbound_no TEXT, deleted_at TEXT);
    `);
    connection = {
      execute: jest.fn(async (sql, params = []) => [database.prepare(sql).all(...params)]),
    };
  });
  afterEach(() => database.close());

  function movement(id, sourceType, { sourceNo = 'SHARED-1', transactionType = sourceType,
    referenceType = sourceType, sourceId = 7, status = 'approved', sequence = 1 } = {}) {
    database.prepare(`INSERT INTO inventory_posting_documents
      (id, source_type, source_id, source_no, finance_status, posting_sequence)
      VALUES (?, ?, ?, ?, ?, ?)`).run(id, sourceType, sourceId, sourceNo, status, sequence);
    database.prepare(`INSERT INTO inventory_posting_lines
      (id, posting_document_id, reference_no, reference_type, transaction_type)
      VALUES (?, ?, ?, ?, ?)`).run(id * 10, id, sourceNo, referenceType, transactionType);
  }

  test('the same number in another module cannot supply missing finance approval', async () => {
    movement(1, 'inbound');
    movement(2, 'sales_outbound');
    expect(await Posting.findApprovedForTransaction(connection, {
      reference_no: 'SHARED-1', reference_type: 'inbound',
    })).toMatchObject({ id: 1 });
    expect(await Posting.findApprovedForTransaction(connection, {
      reference_no: 'SHARED-1', reference_type: 'outbound',
    })).toBeNull();
    expect(connection.execute).toHaveBeenCalledTimes(2);
  });

  test('an untyped ambiguous number requires an explicit posting identity', async () => {
    movement(1, 'inbound');
    movement(2, 'sales_outbound');
    await expect(Posting.findApprovedForTransaction(connection, {
      reference_no: 'SHARED-1',
    })).rejects.toMatchObject({ code: 'INVENTORY_POSTING_AMBIGUOUS' });
    expect(await Posting.findApprovedForTransaction(connection, {
      reference_no: 'SHARED-1', transaction_type: 'sales_outbound',
    })).toMatchObject({ id: 2 });
  });

  test.each([
    { posting_document_id: 1, posting_line_id: 20 },
    { posting_document_id: 1, reference_no: 'OTHER' },
    { posting_document_id: 1, reference_type: 'sales_outbound' },
    { posting_document_id: 1, transaction_type: 'sales_outbound' },
  ])('explicit posting IDs cannot bypass a mismatched transaction identity: %j', async (query) => {
    movement(1, 'inbound');
    movement(2, 'sales_outbound');
    expect(await Posting.findApprovedForTransaction(connection, query)).toBeNull();
  });

  test('matching explicit document and line IDs select exactly their owning movement', async () => {
    movement(1, 'inbound');
    movement(2, 'sales_outbound');
    expect(await Posting.findApprovedForTransaction(connection, {
      posting_document_id: 1, posting_line_id: 10,
      reference_no: 'SHARED-1', reference_type: 'inbound', transaction_type: 'inbound',
    })).toMatchObject({ id: 1 });
    database.exec("UPDATE inventory_posting_documents SET posting_kind = 'reversal' WHERE id = 1");
    expect(await Posting.findApprovedForTransaction(connection, { posting_document_id: 1 })).toBeNull();
  });

  test.each(['12junk', true, 0, -1, '1.5'])('invalid explicit identity %j never reaches SQL', async (id) => {
    await expect(Posting.findApprovedForTransaction(connection, {
      posting_document_id: id,
    })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    expect(connection.execute).not.toHaveBeenCalled();
  });

  test.each(['purchase_inbound', 'batch_create'])('documented purchase alias %s remains supported', async (type) => {
    movement(1, type, { transactionType: 'purchase_inbound' });
    expect(await Posting.findApprovedForTransaction(connection, {
      reference_no: 'SHARED-1', reference_type: 'inbound',
    })).toMatchObject({ id: 1 });
  });

  test('the business approval trail requires its ID and number to identify the same source', async () => {
    movement(1, 'inbound', { sourceNo: 'IN-7' });
    expect(await Posting.getApprovalBySource({ sourceType: 'inbound', sourceId: 7, sourceNo: 'IN-OTHER' }, connection))
      .toMatchObject({ current: null, postings: [] });
    expect(await Posting.getApprovalBySource({ sourceType: 'inbound', sourceId: 7, sourceNo: 'IN-7' }, connection))
      .toMatchObject({ current: { id: 1 } });
  });

  test('an old approved reversal cannot hide a later pending business submission', async () => {
    movement(1, 'inbound', { status: 'reversed' });
    movement(3, 'inbound', { status: 'pending', sequence: 2 });
    database.exec(`INSERT INTO inventory_posting_documents
      (id, source_type, source_id, source_no, posting_kind, original_posting_document_id)
      VALUES (2, 'inbound', 7, 'SHARED-1-REV-1', 'reversal', 1)`);
    const result = await Posting.getApprovalBySource({ sourceType: 'inbound', sourceId: 7, sourceNo: 'SHARED-1' }, connection);
    expect(result).toMatchObject({ current: { id: 3 }, movement: { id: 3 }, reversal: null });
    expect(result.postings).toHaveLength(3);
  });

  test('a pending group reversal remains visible when a supplement is pending', async () => {
    movement(1, 'outbound', { sourceNo: 'OUT-7' });
    movement(3, 'outbound_supplement', { sourceNo: 'OUT-7-S1', status: 'pending' });
    database.exec(`INSERT INTO inventory_outbound VALUES (7, 'OUT-7', NULL);
      INSERT INTO inventory_posting_documents
      (id, source_type, source_id, source_no, posting_kind, original_posting_document_id, finance_status)
      VALUES (2, 'outbound', 7, 'OUT-7-REV-1', 'reversal', 1, 'pending')`);
    expect(await Posting.getApprovalBySource({ sourceType: 'outbound', sourceId: 7, sourceNo: 'OUT-7' }, connection))
      .toMatchObject({ current: { id: 2 }, reversal: { id: 2 } });
    expect(await Posting.getApprovalBySource({ sourceType: 'outbound', sourceId: 7, sourceNo: 'OTHER' }, connection))
      .toMatchObject({ current: null, postings: [] });
  });
});
