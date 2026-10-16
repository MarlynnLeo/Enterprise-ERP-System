/* global jest, beforeEach, afterEach, test, expect */
jest.mock('../../src/config/db', () => ({ pool: {} }));
jest.mock('../../src/utils/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() } }));
jest.mock('../../src/services/business/CostAccountingService', () => ({}));
const { DatabaseSync } = require('node:sqlite');
const Inventory = require('../../src/services/InventoryService');
const Closing = require('../../src/services/business/CostClosingService');
const { consistencyRules } = require('../../src/services/business/DataConsistencyRules');
let database;
let connection;
beforeEach(() => {
  database = new DatabaseSync(':memory:');
  database.exec(`CREATE TABLE inventory_ledger (
    id INTEGER, material_id INTEGER, location_id INTEGER, batch_number TEXT,
    quantity REAL, unit_cost REAL, total_value REAL, transaction_no TEXT, reference_no TEXT,
    transaction_date TEXT, created_at TEXT, receipt_id INTEGER, reversal_of_ledger_id INTEGER);
    CREATE TABLE purchase_receipt_items (receipt_id INTEGER, material_id INTEGER, price REAL);
    CREATE TABLE purchase_receipts (id INTEGER, status TEXT, deleted_at TEXT);
    INSERT INTO inventory_ledger VALUES
      (1,4,1,'B',100,2,200,'IN-1','IN-1','2026-10-15','2026-10-15',NULL,NULL),
      (2,4,1,'B',100,4,400,'IN-2','IN-2','2026-10-15','2026-10-15',NULL,NULL);
  `);
  connection = { execute: jest.fn(async (sql, params = []) => {
    if (sql.includes('inventory_ledger')) return [database.prepare(sql).all(...params)];
    if (sql.includes('AS snapshot_count')) return [[{ snapshot_count: 0, total_wip: 0, invalid_snapshot_count: 0 }]];
    return [[]];
  }) };
});
afterEach(() => database.close());
const audit = () => database.prepare(consistencyRules.find(r => r.id === 'inventory.outbound_cost_matches_source_batch').sql).all();
const checks = async () => (await Closing.collectChecks(connection, { id: 1, start_date: '2026-10-01', end_date: '2026-10-31' })).find(c => c.key === 'inventoryCost');

test('posting weighted price passes both live closing SQL and declarative audit', async () => {
  const cost = await Inventory._getBatchUnitCost({ materialId: 4, locationId: 1, batchNumber: 'B' }, connection);
  expect(cost).toBe(3);
  database.prepare('INSERT INTO inventory_ledger VALUES (3,4,1,?, -10,?,30,?,?,?, ?,NULL,NULL)').run('B',cost,'OUT-1','OUT-1','2026-10-15','2026-10-15');
  expect(audit()).toEqual([]);
  expect((await checks()).passed).toBe(true);
  // A later receipt changes today's average, not the historical outbound basis.
  database.exec("INSERT INTO inventory_ledger VALUES (4,4,1,'B',100,9,900,'IN-3','IN-3','2026-10-16','2026-10-16',NULL,NULL)");
  expect(audit()).toEqual([]);
  expect((await checks()).passed).toBe(true);
});

test('an incorrectly priced outbound still blocks closing', async () => {
  database.exec("INSERT INTO inventory_ledger VALUES (3,4,1,'B',-10,4,40,'OUT-1','OUT-1','2026-10-15','2026-10-15',NULL,NULL)");
  expect(audit().map(r => r.id)).toEqual([3]);
  expect((await checks()).status).toBe('blocker');
});

test('reversal preserves original cost and is not repriced at a later batch average', async () => {
  database.exec("INSERT INTO inventory_ledger VALUES (3,4,1,'B',-100,2,200,'REV-1','REV-1','2026-10-15','2026-10-15',NULL,1)");
  expect(audit()).toEqual([]);
  expect((await checks()).passed).toBe(true);
});
