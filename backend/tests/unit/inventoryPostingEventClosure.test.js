/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() } }));
const { DatabaseSync } = require('node:sqlite');
const { pool } = require('../../src/config/db');
const Closure = require('../../src/services/business/InventoryPostingEventClosureService');
let database;
let connection;
beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.function('JSON_UNQUOTE', (value) => value);
  database.function('CONCAT', (...args) => args.join(''));
  database.exec(`
    CREATE TABLE inventory_posting_documents (id INTEGER, source_type TEXT, source_id INTEGER, source_no TEXT, posting_kind TEXT, finance_status TEXT, locked INTEGER);
    INSERT INTO inventory_posting_documents VALUES (1,'outbound',10,'OUT-10','movement','reversed',1),(2,'outbound',10,'REV-10','reversal','approved',1);
    CREATE TABLE inventory_posting_events (posting_document_id INTEGER, event_type TEXT, event_data TEXT);
    INSERT INTO inventory_posting_events VALUES (1,'finance_reversed','{"reversalDocumentId":2}');
    CREATE TABLE inventory_posting_lines (id INTEGER, posting_document_id INTEGER, signed_quantity REAL);
    INSERT INTO inventory_posting_lines VALUES (11,1,-5);
    CREATE TABLE inventory_ledger (id INTEGER, posting_line_id INTEGER, posting_document_id INTEGER, reversal_of_ledger_id INTEGER, quantity REAL, total_value REAL, unit_cost REAL, material_id INTEGER, location_id INTEGER, batch_number TEXT);
    INSERT INTO inventory_ledger VALUES (21,11,1,NULL,-5,10,2,5,6,'B'),(22,12,2,21,5,10,2,5,6,'B');
    CREATE TABLE inventory_outbound (id INTEGER, outbound_no TEXT, status TEXT);
    INSERT INTO inventory_outbound VALUES (10,'OUT-10','reversed');
    CREATE TABLE domain_events (id INTEGER, event_name TEXT, payload TEXT, status TEXT, processed_at TEXT, locked_at TEXT, error_message TEXT, updated_at TEXT);
    INSERT INTO domain_events VALUES (31,'INVENTORY_POSTING_APPROVED','{"postingDocumentId":"1"}','failed',NULL,NULL,'old',NULL),(32,'INVENTORY_POSTING_APPROVED','{"postingDocumentId":"9"}','failed',NULL,NULL,'other',NULL);
    CREATE TABLE sys_failed_jobs (id INTEGER, task_name TEXT, payload TEXT, status TEXT, resolved_at TEXT, locked_at TEXT, next_retry_at TEXT, updated_at TEXT, error_message TEXT);
    INSERT INTO sys_failed_jobs VALUES
      (41,'EventBus:INVENTORY_POSTING_APPROVED','{"args":[{"postingDocumentId":"1"}]}','failed',NULL,NULL,NULL,NULL,'attempt 1'),
      (42,'EventBus:INVENTORY_POSTING_APPROVED','{"args":[{"postingDocumentId":"1"}]}','pending',NULL,NULL,NULL,NULL,'attempt 2'),
      (43,'Finance:InventoryPostingApproved','{"postingDocumentId":"9"}','failed',NULL,NULL,NULL,NULL,'other');
  `);
  connection = {
    beginTransaction: jest.fn(async () => database.exec('BEGIN')),
    commit: jest.fn(async () => database.exec('COMMIT')),
    rollback: jest.fn(async () => database.exec('ROLLBACK')),
    release: jest.fn(),
    execute: jest.fn(async (sql, params = []) => {
      const statement = database.prepare(sql.replace(/ FOR UPDATE/g, '').replace(/NOW\(\)/g, "datetime('now')"));
      return /^\s*SELECT/.test(sql) ? [statement.all(...params)] : [{ affectedRows: Number(statement.run(...params).changes) }];
    }),
  };
  pool.getConnection.mockResolvedValue(connection);
});
afterEach(() => database.close());

test('verified reversal closes only the original event and all its historical failures atomically', async () => {
  expect(await Closure.closeReversedPosting(1)).toEqual({ originalId: 1, reversalId: 2, verifiedLines: 1 });
  expect(database.prepare('SELECT status FROM domain_events ORDER BY id').all().map(r => r.status)).toEqual(['processed', 'failed']);
  expect(database.prepare('SELECT status FROM sys_failed_jobs ORDER BY id').all().map(r => r.status)).toEqual(['resolved', 'resolved', 'failed']);
  const before = database.prepare('SELECT error_message FROM sys_failed_jobs WHERE id=41').get().error_message;
  await Closure.closeReversedPosting(1);
  expect(database.prepare('SELECT error_message FROM sys_failed_jobs WHERE id=41').get().error_message).toBe(before);
  expect(database.prepare('SELECT COUNT(*) AS n FROM inventory_ledger').get().n).toBe(2);
});

test.each([
  "DELETE FROM inventory_posting_events",
  "UPDATE inventory_posting_documents SET finance_status='pending' WHERE id=2",
  'UPDATE inventory_ledger SET quantity=4 WHERE id=22',
  'UPDATE inventory_ledger SET unit_cost=3 WHERE id=22',
  "UPDATE inventory_ledger SET batch_number='OTHER' WHERE id=22",
  "UPDATE inventory_outbound SET status='completed'",
])('incomplete compensation remains blocked: %s', async (change) => {
  database.exec(change);
  await expect(Closure.closeReversedPosting(1)).rejects.toMatchObject({ code: 'INVENTORY_REVERSAL_INCOMPLETE' });
  expect(database.prepare('SELECT status FROM domain_events WHERE id=31').get().status).toBe('failed');
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id=41').get().status).toBe('failed');
  expect(connection.rollback).toHaveBeenCalled();
});

test('a persistence failure rolls back root and child state together', async () => {
  const execute = connection.execute.getMockImplementation();
  connection.execute.mockImplementation((sql, params) => {
    if (sql.includes('UPDATE sys_failed_jobs')) throw new Error('write failed');
    return execute(sql, params);
  });
  await expect(Closure.closeReversedPosting(1)).rejects.toThrow('write failed');
  expect(database.prepare('SELECT status FROM domain_events WHERE id=31').get().status).toBe('failed');
});

test.each([
  [10, 'OUT-10-Sfrozen123'],
  [10, 'OUT-10-补发'],
  [null, 'OUT-10-补发'],
])('a reversed supplement resolves through its parent outbound: %s / %s', async (sourceId, sourceNo) => {
  database.prepare("UPDATE inventory_posting_documents SET source_type='outbound_supplement', source_id=?, source_no=? WHERE id=1").run(sourceId, sourceNo);

  await expect(Closure.closeReversedPosting(1)).resolves.toEqual({ originalId: 1, reversalId: 2, verifiedLines: 1 });

  expect(database.prepare('SELECT status FROM domain_events WHERE id=31').get().status).toBe('processed');
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id=41').get().status).toBe('resolved');
  const sourceQuery = connection.execute.mock.calls.find(([sql]) => sql.includes('FROM inventory_outbound'));
  expect(sourceQuery[0]).toContain(sourceId == null ? 'outbound_no = ?' : 'id = ?');
  expect(sourceQuery[1]).toEqual([sourceId == null ? 'OUT-10' : sourceId]);
});

test.each([
  [null, 'OUT-10-Sfrozen123'],
  [null, 'OUT-10'],
  [null, 'OUT-10-补发-extra'],
  [null, '-补发'],
  [0, 'OUT-10-补发'],
  [99, 'OUT-10-补发'],
])('unverifiable supplement linkage cannot clear finance failures: %s / %s', async (sourceId, sourceNo) => {
  database.prepare("UPDATE inventory_posting_documents SET source_type='outbound_supplement', source_id=?, source_no=? WHERE id=1").run(sourceId, sourceNo);

  await expect(Closure.closeReversedPosting(1)).rejects.toMatchObject({ code: 'INVENTORY_REVERSAL_INCOMPLETE' });

  expect(database.prepare('SELECT status FROM domain_events WHERE id=31').get().status).toBe('failed');
  expect(database.prepare('SELECT status FROM sys_failed_jobs WHERE id=41').get().status).toBe('failed');
  expect(connection.rollback).toHaveBeenCalledTimes(1);
});

test('a supplement remains failed until its parent outbound reversal has completed', async () => {
  database.exec("UPDATE inventory_posting_documents SET source_type='outbound_supplement', source_no='OUT-10-S1' WHERE id=1; UPDATE inventory_outbound SET status='completed'");
  await expect(Closure.closeReversedPosting(1)).rejects.toMatchObject({ code: 'INVENTORY_REVERSAL_INCOMPLETE' });
  expect(database.prepare('SELECT status FROM domain_events WHERE id=31').get().status).toBe('failed');
});
