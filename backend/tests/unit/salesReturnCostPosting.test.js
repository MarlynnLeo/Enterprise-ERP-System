/* global beforeEach, afterEach, expect, jest, test */
jest.mock('../../src/config/db', () => ({ pool: { getConnection: jest.fn() }, getConnection: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ logger: {
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
} }));
jest.mock('../../src/services/business/DomainEventService', () => ({
  enqueue: jest.fn(async () => 1), dispatchSoon: jest.fn(),
}));
jest.mock('../../src/services/business/OutboundPostingGroupService', () => ({ assertWritable: jest.fn() }));
jest.mock('../../src/services/business/PeriodValidationService', () => ({
  validateInventoryTransaction: jest.fn(async () => ({ allowed: true })),
}));
jest.mock('../../src/services/business/SalesReturnEligibilityService', () => ({
  assertReturnable: jest.fn(),
  validationError: message => Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' }),
}));
jest.mock('../../src/services/business/SalesOrderStatusService', () => ({ updateOrderStatus: jest.fn() }));
jest.mock('../../src/authorization/ScopeGuard', () => ({ denyUnlessAccess: jest.fn(async () => true) }));
jest.mock('../../src/utils/sales/salesOrderLocks', () => ({ lockSalesOrders: jest.fn(async () => new Set([2])) }));

const { DatabaseSync } = require('node:sqlite');
const { createHash } = require('node:crypto');
const db = require('../../src/config/db');
const Inventory = require('../../src/services/InventoryService');
const Posting = require('../../src/services/InventoryPostingService');
const events = require('../../src/services/business/DomainEventService');
const controller = require('../../src/controllers/business/sales/salesReturnController');

let database;
let connection;
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() });
const returnLines = () => database.prepare('SELECT * FROM inventory_posting_lines WHERE posting_document_id = 77 ORDER BY id').all();
const returnedLedger = () => database.prepare("SELECT * FROM inventory_ledger WHERE reference_type = 'sales_return' ORDER BY id").all();
const complete = async () => {
  const res = response();
  await controller.updateSalesReturnStatus({ params: { id: '7' }, body: { status: 'completed' }, user: { id: 9, username: 'seller' } }, res);
  return res;
};

function addShipment({ outboundId = 3, itemId = 50, orderId = 2, productId = 4, quantity = 2, unitCost = 10, postedQuantity = quantity, legacy = false } = {}) {
  const number = `SO-${outboundId}`;
  database.prepare("INSERT OR IGNORE INTO sales_outbound (id, outbound_no, order_id, status) VALUES (?, ?, ?, 'completed')")
    .run(outboundId, number, orderId);
  database.prepare('INSERT INTO sales_outbound_items (id, outbound_id, source_order_id, product_id, quantity) VALUES (?, ?, ?, ?, ?)')
    .run(itemId, outboundId, orderId, productId, quantity);
  if (postedQuantity === 0) return;
  database.prepare('INSERT INTO inventory_posting_lines (id, posting_document_id, source_line_key) VALUES (?, 1, ?)')
    .run(itemId, legacy ? null : `sales_outbound:${outboundId}:item:${itemId}:9:B-${itemId}`);
  database.prepare("INSERT INTO inventory_ledger (material_id, location_id, reference_type, reference_no, quantity, unit_cost, total_value, batch_number, posting_line_id) VALUES (?, 9, 'sales_outbound', ?, ?, ?, ?, ?, ?)")
    .run(productId, number, -postedQuantity, unitCost, -postedQuantity * unitCost, `B-${itemId}`, itemId);
}

beforeEach(() => {
  jest.clearAllMocks();
  database = new DatabaseSync(':memory:');
  database.function('NOW', () => '2026-10-17 00:00:00');
  database.function('CONCAT', { varargs: true }, (...values) => values.join(''));
  database.function('SHA2', (value, bits) => createHash(`sha${bits}`).update(String(value)).digest('hex'));
  database.exec(`
    CREATE TABLE materials (id INTEGER PRIMARY KEY, code TEXT, name TEXT, unit_id INTEGER, location_id INTEGER, cost_price NUMERIC, deleted_at TEXT);
    CREATE TABLE sales_returns (id INTEGER PRIMARY KEY, return_no TEXT, order_id INTEGER, outbound_id INTEGER, status TEXT, return_date TEXT, return_reason TEXT, remarks TEXT, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE sales_return_items (id INTEGER PRIMARY KEY, return_id INTEGER, product_id INTEGER, quantity NUMERIC, reason TEXT);
    CREATE TABLE sales_outbound (id INTEGER PRIMARY KEY, outbound_no TEXT, order_id INTEGER, status TEXT, deleted_at TEXT);
    CREATE TABLE sales_outbound_items (id INTEGER PRIMARY KEY, outbound_id INTEGER, source_order_id INTEGER, product_id INTEGER, quantity NUMERIC);
    CREATE TABLE inventory_posting_documents (
      id INTEGER PRIMARY KEY, posting_no TEXT, source_type TEXT, source_id INTEGER, source_no TEXT,
      posting_sequence INTEGER DEFAULT 1, posting_kind TEXT DEFAULT 'movement', finance_status TEXT DEFAULT 'pending',
      business_approved_by_id INTEGER, business_approved_by TEXT, locked INTEGER DEFAULT 0,
      finance_approved_by INTEGER, finance_approved_label TEXT, finance_approved_at TEXT,
      total_quantity NUMERIC DEFAULT 0, total_value NUMERIC DEFAULT 0, snapshot_hash TEXT, updated_at TEXT
    );
    CREATE TABLE inventory_posting_lines (
      id INTEGER PRIMARY KEY, posting_document_id INTEGER, line_no INTEGER, source_line_key TEXT,
      material_id INTEGER, location_id INTEGER, transaction_type TEXT, reference_type TEXT,
      reference_no TEXT, signed_quantity NUMERIC, unit_id INTEGER, batch_number TEXT, unit_cost NUMERIC,
      total_value NUMERIC, transaction_date TEXT, operator TEXT, payload_json TEXT, snapshot_hash TEXT,
      posted_quantity NUMERIC, posted_value NUMERIC, created_at TEXT, updated_at TEXT,
      UNIQUE (posting_document_id, source_line_key)
    );
    CREATE TABLE inventory_ledger (
      id INTEGER PRIMARY KEY, material_id INTEGER, location_id INTEGER, transaction_type TEXT, transaction_no TEXT,
      reference_no TEXT, reference_type TEXT, quantity NUMERIC, before_quantity NUMERIC, after_quantity NUMERIC,
      unit_id INTEGER, batch_number TEXT, supplier_id INTEGER, supplier_name TEXT, production_date TEXT,
      expiry_date TEXT, warehouse_name TEXT, operator TEXT, remark TEXT, issue_reason TEXT, is_excess INTEGER,
      bom_required_qty NUMERIC, total_issued_qty NUMERIC, transaction_date TEXT, created_at TEXT,
      unit_cost NUMERIC, total_value NUMERIC, purchase_order_id INTEGER, purchase_order_no TEXT, receipt_id INTEGER,
      receipt_no TEXT, idempotency_key TEXT, posting_document_id INTEGER, posting_line_id INTEGER, reversal_of_ledger_id INTEGER
    );
    CREATE TABLE inventory_posting_events (
      id INTEGER PRIMARY KEY, posting_document_id INTEGER, event_type TEXT, from_status TEXT,
      to_status TEXT, actor_id INTEGER, actor_label TEXT, remark TEXT, event_data TEXT
    );
    INSERT INTO materials VALUES (4, 'MAT-4', 'Product', 1, 9, 25, NULL);
    INSERT INTO sales_returns (id, return_no, order_id, outbound_id, status, return_date, return_reason)
      VALUES (7, 'SR-7', 2, 3, 'approved', '2026-10-17', 'Return');
    INSERT INTO sales_return_items VALUES (8, 7, 4, 2, 'Return');
  `);
  const execute = async (sql, params = []) => {
    // Standard-cost lookup is unrelated to this test; model a current master
    // cost while leaving the actual source-cost and batch-cost queries intact.
    if (sql.includes('AS active_standard_cost'))
      return [[database.prepare('SELECT cost_price FROM materials WHERE id = ?').get(params[0])]];
    let index = 0;
    const flat = [];
    const translated = sql.replace(/\s+FOR UPDATE\b/g, '').replace(/\?/g, () => {
      const value = params[index++];
      if (Array.isArray(value)) {
        flat.push(...value);
        return value.map(() => '?').join(',');
      }
      flat.push(value);
      return '?';
    });
    const statement = database.prepare(translated);
    if (/^\s*SELECT/i.test(sql)) return [statement.all(...flat)];
    const result = statement.run(...flat);
    return [{ insertId: Number(result.lastInsertRowid), affectedRows: Number(result.changes) }];
  };
  connection = {
    execute: jest.fn(execute), query: jest.fn(execute),
    beginTransaction: jest.fn(async () => database.exec('BEGIN')),
    commit: jest.fn(async () => database.exec('COMMIT')),
    rollback: jest.fn(async () => database.exec('ROLLBACK')),
    release: jest.fn(),
  };
  db.pool.getConnection.mockResolvedValue(connection);
  db.getConnection.mockResolvedValue(connection);
  jest.spyOn(Posting, '_getOrCreateDocument').mockImplementation(async (_conn, input) => {
    database.prepare(`INSERT OR IGNORE INTO inventory_posting_documents
      (id, posting_no, source_type, source_id, source_no, business_approved_by_id, business_approved_by)
      VALUES (77, 'INV-77', ?, ?, ?, 9, 'seller')`).run(input.sourceType, input.sourceId, input.sourceNo);
    return database.prepare('SELECT * FROM inventory_posting_documents WHERE id = 77').get();
  });
  jest.spyOn(Posting, '_lockDocumentForAction').mockImplementation(async (_conn, id) =>
    database.prepare('SELECT * FROM inventory_posting_documents WHERE id = ?').get(id));
  jest.spyOn(Inventory, '_findLedgerByIdempotencyKey').mockResolvedValue(null);
  jest.spyOn(Inventory, '_lockStockLocation').mockResolvedValue();
  jest.spyOn(Inventory, 'getCurrentStock').mockResolvedValue(100);
  jest.spyOn(Inventory, '_validateMaterialAndLocation').mockResolvedValue();
  jest.spyOn(Inventory, '_adjustStockBalance').mockResolvedValue();
  jest.spyOn(Inventory, 'clearStockCache').mockResolvedValue();
  jest.spyOn(global, 'setImmediate').mockImplementation(() => 0);
});

afterEach(() => { jest.restoreAllMocks(); database.close(); });

test('freezes original shipment cost and posts that snapshot despite later master cost changes', async () => {
  addShipment();
  const res = await complete();
  expect(res.status).toHaveBeenCalledWith(200);
  expect(returnLines()).toHaveLength(1);
  expect(returnLines()[0]).toMatchObject({ unit_cost: 10, total_value: 20, signed_quantity: 2 });
  expect(returnedLedger()).toHaveLength(0);
  database.exec('UPDATE materials SET cost_price = 99 WHERE id = 4');
  await expect(Posting.approve(77, { id: 60, label: 'finance' })).resolves.toMatchObject({ financeStatus: 'approved' });
  expect(returnedLedger()).toHaveLength(1);
  expect(returnedLedger()[0]).toMatchObject({ unit_cost: 10, total_value: 20, quantity: 2 });
  await expect(Posting.approve(77, { id: 60, label: 'finance' })).rejects.toMatchObject({ code: 'INVALID_STATUS' });
  expect(returnedLedger()).toHaveLength(1);
});

test('uses the selected outbound and exact order line in a combined shipment', async () => {
  addShipment({ outboundId: 2, itemId: 40, unitCost: 5 });
  addShipment({ itemId: 50, unitCost: 10 });
  addShipment({ itemId: 51, orderId: 999, unitCost: 100 });
  expect((await complete()).status).toHaveBeenCalledWith(200);
  expect(returnLines()[0]).toMatchObject({ unit_cost: 10, total_value: 20 });
});

test('without an outbound selection weights only original shipments belonging to the order', async () => {
  database.exec('UPDATE sales_returns SET outbound_id = NULL WHERE id = 7');
  addShipment({ outboundId: 2, itemId: 40, unitCost: 5 });
  addShipment({ itemId: 50, unitCost: 15 });
  addShipment({ itemId: 51, orderId: 999, unitCost: 100 });
  expect((await complete()).status).toHaveBeenCalledWith(200);
  expect(returnLines()[0]).toMatchObject({ unit_cost: 10, total_value: 20 });
});

test.each([
  ['missing shipment', null],
  ['missing ledger', { postedQuantity: 0 }],
  ['partially posted shipment', { postedQuantity: 1 }],
  ['zero source cost', { unitCost: 0 }],
  ['wrong selected outbound', { outboundId: 99 }],
])('rejects %s and rolls back completion instead of using current master cost', async (_label, fixture) => {
  if (fixture) addShipment(fixture);
  const res = await complete();
  expect(res.status).toHaveBeenCalledWith(400);
  expect(connection.rollback).toHaveBeenCalledTimes(1);
  expect(connection.commit).not.toHaveBeenCalled();
  expect(database.prepare('SELECT status FROM sales_returns WHERE id = 7').get().status).toBe('approved');
  expect(returnLines()).toHaveLength(0);
  expect(returnedLedger()).toHaveLength(0);
  expect(events.enqueue).not.toHaveBeenCalled();
});

test('rejects unidentifiable historical costs in a combined shipment', async () => {
  addShipment({ itemId: 50, legacy: true });
  addShipment({ itemId: 51, orderId: 999, unitCost: 100, legacy: true });
  expect((await complete()).status).toHaveBeenCalledWith(400);
  expect(returnLines()).toHaveLength(0);
});

test('same-product return rows keep independent frozen identities and completion retry does not duplicate them', async () => {
  database.exec("INSERT INTO sales_return_items VALUES (9, 7, 4, 1, 'Second row')");
  addShipment({ quantity: 3 });
  expect((await complete()).status).toHaveBeenCalledWith(200);
  expect(returnLines().map(line => line.total_value)).toEqual([20, 10]);
  expect(new Set(returnLines().map(line => line.source_line_key)).size).toBe(2);
  const sourceQueries = connection.query.mock.calls.filter(([sql]) => sql.includes('AS material_quantity')).length;
  database.exec('UPDATE materials SET cost_price = 99 WHERE id = 4');
  expect((await complete()).status).toHaveBeenCalledWith(200);
  expect(connection.query.mock.calls.filter(([sql]) => sql.includes('AS material_quantity'))).toHaveLength(sourceQueries);
  expect(returnLines()).toHaveLength(2);
  expect(events.enqueue).toHaveBeenCalledTimes(1);
  await Posting.approve(77, { id: 60, label: 'finance' });
  expect(returnedLedger().map(line => line.total_value)).toEqual([20, 10]);
});
